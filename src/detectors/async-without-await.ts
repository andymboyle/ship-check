import { isJsFile } from "../constants";
import type { DetectorResult, Finding } from "../types";
import type { SourceFile } from "../walker";

/**
 * Detect async functions that never use await.
 * If a function is marked async but doesn't await anything, it doesn't need to be async.
 * This adds unnecessary microtask overhead and suggests the author might have forgotten to await.
 */
export function detectAsyncWithoutAwait(files: SourceFile[]): DetectorResult {
  const findings: Finding[] = [];

  for (const file of files) {
    if (file.isTest) continue;
    if (!isJsFile(file.ext)) continue;

    findings.push(...detectJsAsyncWithoutAwait(file));
  }

  return {
    detector: "async-without-await",
    name: "Async Without Await",
    description: "Functions marked async that never use await — unnecessary or missing an await",
    findings,
  };
}

function detectJsAsyncWithoutAwait(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Find async function/arrow declarations
    const isAsyncFunc =
      /\basync\s+function\s+(\w+)/.test(trimmed) ||
      /\basync\s+(\w+)\s*\(/.test(trimmed) ||
      /\basync\s*\([^)]*\)\s*=>/.test(trimmed) ||
      /\basync\s+\w+\s*=>\s*/.test(trimmed);

    if (!isAsyncFunc) continue;

    // Find the function name for the message
    const nameMatch = trimmed.match(/async\s+function\s+(\w+)/) ||
      trimmed.match(/async\s+(\w+)\s*\(/) ||
      trimmed.match(/(\w+)\s*=\s*async/);
    const funcName = nameMatch?.[1] ?? "anonymous";

    // Find the function body by tracking braces
    let braceDepth = 0;
    let foundOpen = false;
    let hasAwait = false;
    let bodyEnd = i;

    for (let j = i; j < lines.length; j++) {
      const bodyLine = lines[j];

      // Check for await in the body
      if (j > i && /\bawait\b/.test(bodyLine)) {
        hasAwait = true;
        break;
      }

      for (const ch of bodyLine) {
        if (ch === "{") { foundOpen = true; braceDepth++; }
        if (ch === "}") braceDepth--;
      }

      if (foundOpen && braceDepth === 0) {
        bodyEnd = j;
        break;
      }

      // Safety: don't scan more than 100 lines for one function
      if (j - i > 100) {
        hasAwait = true; // assume it has await, don't flag
        break;
      }
    }

    if (hasAwait) continue;

    // Skip one-line arrow functions that just return — these are often used as adapters
    if (bodyEnd === i || bodyEnd - i <= 2) continue;

    // Skip if the function body is very short (1-3 statements)
    const bodyLength = bodyEnd - i;
    if (bodyLength <= 3) continue;

    findings.push({
      detector: "async-without-await",
      severity: "MEDIUM",
      file: relPath,
      line: i + 1,
      message: `async function '${funcName}' never uses await — remove async or add missing await`,
      fix: "Remove the async keyword, or add the missing await call",
      source: trimmed.length > 80 ? trimmed.slice(0, 77) + "..." : trimmed,
    });
  }

  return findings;
}
