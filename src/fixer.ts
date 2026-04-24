import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import type { Finding, FixResult } from "./types";

/**
 * Apply auto-fixes for fixable findings.
 * Reads each affected file, applies the fix, writes it back.
 * Returns a list of what was changed.
 */
export function applyFixes(rootDir: string, findings: Finding[]): FixResult[] {
  const fixable = findings.filter((f) => f.fixable && f._fixId);
  if (fixable.length === 0) return [];

  // Group fixes by file (so we read/write each file once)
  const byFile = new Map<string, Finding[]>();
  for (const f of fixable) {
    const existing = byFile.get(f.file);
    if (existing) {
      existing.push(f);
    } else {
      byFile.set(f.file, [f]);
    }
  }

  const results: FixResult[] = [];

  for (const [relPath, fileFindings] of byFile) {
    const fullPath = resolve(rootDir, relPath);

    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    let modified = false;

    // Sort by line number descending so we can modify without shifting line numbers
    const sorted = [...fileFindings].sort((a, b) => b.line - a.line);

    for (const finding of sorted) {
      const lineIdx = finding.line - 1;
      if (lineIdx < 0 || lineIdx >= lines.length) continue;

      const before = lines[lineIdx];
      const after = applyLineFix(before, lines, lineIdx, finding._fixId!);

      if (after !== null && after !== before) {
        // For multi-line fixes, after may contain newlines
        if (after.includes("\n")) {
          const newLines = after.split("\n");
          lines.splice(lineIdx, 1, ...newLines);
        } else {
          lines[lineIdx] = after;
        }
        results.push({ file: relPath, line: finding.line, before: before.trim(), after: after.trim() });
        modified = true;
      }
    }

    if (modified) {
      writeFileSync(fullPath, lines.join("\n"));
    }
  }

  return results;
}

/**
 * Apply a specific fix to a single line.
 * Returns the modified line, or null if the fix couldn't be applied.
 */
function applyLineFix(
  line: string,
  allLines: string[],
  lineIdx: number,
  fixId: string,
): string | null {
  switch (fixId) {
    case "fetch-no-timeout":
      return fixFetchTimeout(line);

    case "httpx-no-timeout":
      return fixPythonParam(line, /httpx\.(?:AsyncClient|Client)\s*\(/, "timeout=30.0");

    case "requests-no-timeout":
      return fixPythonParam(line, /requests\.(get|post|put|patch|delete|head|options)\s*\(/, "timeout=30");

    case "aiohttp-no-timeout":
      return fixPythonParam(line, /aiohttp\.ClientSession\s*\(/, "timeout=aiohttp.ClientTimeout(total=30)");

    case "redis-py-no-timeout":
      return fixPythonParam(line, /redis\.(?:Redis|StrictRedis)\s*\(/, "socket_timeout=5, socket_connect_timeout=5");

    case "axios-create-no-timeout":
      return fixAxiosCreate(line);

    case "ioredis-no-timeout":
      return fixJsConstructorParam(line, /new\s+Redis\s*\(/, "connectTimeout: 5000");

    default:
      return null;
  }
}

// --- Fix implementations ---

/**
 * Add AbortSignal.timeout to a fetch() call.
 * Handles:
 *   fetch(url)                    → fetch(url, { signal: AbortSignal.timeout(30_000) })
 *   fetch(url, { ...opts })       → fetch(url, { signal: AbortSignal.timeout(30_000), ...opts })
 *   fetch(url, opts)              → can't fix safely (variable opts)
 */
function fixFetchTimeout(line: string): string | null {
  // Case 1: fetch(url) with no second arg — add options object
  // Match fetch("url") or fetch(variable) with closing paren on same line
  const simpleMatch = line.match(/(\bfetch\s*\([^,]+)\)(\s*;?\s*)$/);
  if (simpleMatch) {
    return line.replace(
      simpleMatch[0],
      `${simpleMatch[1]}, { signal: AbortSignal.timeout(30_000) })${simpleMatch[2]}`,
    );
  }

  // Case 2: fetch(url, { ... }) — add signal to the options object
  const optsMatch = line.match(/(\bfetch\s*\([^,]+,\s*)\{/);
  if (optsMatch) {
    return line.replace(
      optsMatch[0],
      `${optsMatch[1]}{ signal: AbortSignal.timeout(30_000), `,
    );
  }

  // Can't auto-fix (multi-line, variable opts, etc.)
  return null;
}

/**
 * Add a parameter to a Python function call.
 * Works for single-line calls: httpx.AsyncClient() → httpx.AsyncClient(timeout=30.0)
 * and calls with existing params: httpx.AsyncClient(base_url="...") → httpx.AsyncClient(base_url="...", timeout=30.0)
 */
function fixPythonParam(line: string, pattern: RegExp, param: string): string | null {
  const match = line.match(pattern);
  if (!match) return null;

  const callStart = match.index! + match[0].length;
  const rest = line.slice(callStart);

  // Empty parens: func() → func(param)
  if (rest.startsWith(")")) {
    return line.slice(0, callStart) + param + rest;
  }

  // Has existing params: func(existing) → func(existing, param)
  // Find the closing paren
  const closeParen = findClosingParen(rest);
  if (closeParen === -1) return null; // multi-line call, can't fix

  const existingParams = rest.slice(0, closeParen).trim();
  const afterClose = rest.slice(closeParen);
  return line.slice(0, callStart) + existingParams + ", " + param + afterClose;
}

/**
 * Add timeout to axios.create({ ... })
 */
function fixAxiosCreate(line: string): string | null {
  const match = line.match(/axios\.create\s*\(\s*\{/);
  if (!match) return null;

  // Insert timeout right after the opening brace
  return line.replace(
    match[0],
    `${match[0]} timeout: 30_000, `,
  );
}

/**
 * Add parameter to a JS constructor: new Redis() → new Redis({ param })
 */
function fixJsConstructorParam(line: string, pattern: RegExp, param: string): string | null {
  const match = line.match(pattern);
  if (!match) return null;

  const callStart = match.index! + match[0].length;
  const rest = line.slice(callStart);

  // new Redis() → new Redis({ param })
  if (rest.startsWith(")")) {
    return line.slice(0, callStart) + "{ " + param + " }" + rest;
  }

  // new Redis({ ... }) — add param
  if (rest.trimStart().startsWith("{")) {
    const braceIdx = rest.indexOf("{");
    return line.slice(0, callStart) + rest.slice(0, braceIdx + 1) + " " + param + ", " + rest.slice(braceIdx + 1);
  }

  // new Redis(url) or new Redis(url, { ... }) — can't safely modify
  return null;
}

/**
 * Find the position of the closing paren, accounting for nesting.
 */
function findClosingParen(str: string): number {
  let depth = 0;
  let inString: string | null = null;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    // Track string state (skip parens inside strings)
    if (!inString && (ch === '"' || ch === "'" || ch === "`")) {
      inString = ch;
      continue;
    }
    if (inString && ch === inString && str[i - 1] !== "\\") {
      inString = null;
      continue;
    }
    if (inString) continue;

    if (ch === "(") depth++;
    if (ch === ")") {
      if (depth === 0) return i;
      depth--;
    }
  }

  return -1;
}
