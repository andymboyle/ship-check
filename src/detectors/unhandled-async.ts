import { isJsFile } from "../constants";
import type { DetectorResult, Finding } from "../types";
import type { SourceFile } from "../walker";

/**
 * Detect unhandled async errors:
 * - Promises without .catch() or try/catch
 * - Event handlers that are async but don't catch
 * - Fire-and-forget async calls
 */
export function detectUnhandledAsync(files: SourceFile[]): DetectorResult {
  const findings: Finding[] = [];

  for (const file of files) {
    if (file.isTest) continue;

    if (isJsFile(file.ext)) {
      findings.push(...detectJsUnhandledAsync(file));
    } else if (file.ext === ".py") {
      findings.push(...detectPythonUnhandledAsync(file));
    }
  }

  return {
    detector: "unhandled-async",
    name: "Unhandled Async Errors",
    description: "Fire-and-forget promises, async event handlers without error handling",
    findings,
  };
}

function detectJsUnhandledAsync(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Fire-and-forget: calling an async function without await, .then, or .catch
    // Pattern: someAsyncFunction(); (no await, no .then, no .catch on the line or next)
    // This is hard to detect reliably, so focus on the clearest patterns:

    // 1. Promise.all/allSettled/race without catch
    if (/Promise\.(all|race|allSettled)\s*\(/.test(trimmed)) {
      // Check if it's awaited or has .catch
      if (!/\bawait\b/.test(trimmed) && !/\.catch\b/.test(trimmed)) {
        const nextLines = lines.slice(i, Math.min(i + 3, lines.length)).join(" ");
        if (!/\.catch\b/.test(nextLines) && !/\.then\b/.test(nextLines)) {
          findings.push({
            detector: "unhandled-async",
            severity: "HIGH",
            file: relPath,
            line: i + 1,
            message: "Promise.all/race without await or .catch — rejected promises will be unhandled",
            fix: "Add await or .catch() to handle errors",
            source: trimmed,
          });
        }
      }
    }

    // 2. addEventListener/on with async callback but no try/catch inside
    if (/\.(addEventListener|on)\s*\(\s*['"`]\w+['"`]\s*,\s*async\b/.test(trimmed)) {
      // Find the end of this handler by tracking braces
      let depth = 0;
      let handlerEnd = Math.min(i + 15, lines.length);
      for (let j = i; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === "{") depth++;
          if (ch === "}") depth--;
        }
        if (depth === 0 && j > i) { handlerEnd = j + 1; break; }
      }
      const handler = lines.slice(i, handlerEnd).join("\n");
      if (!/\btry\s*\{/.test(handler)) {
        findings.push({
          detector: "unhandled-async",
          severity: "MEDIUM",
          file: relPath,
          line: i + 1,
          message: "Async event handler without try/catch — errors become unhandled rejections",
          fix: "Wrap the handler body in try/catch",
          source: trimmed.slice(0, 80),
        });
      }
    }
  }

  return findings;
}

function detectPythonUnhandledAsync(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // asyncio.create_task without error handling
    if (/asyncio\.create_task\s*\(/.test(trimmed)) {
      // Check if the task result is captured
      if (!/\b\w+\s*=/.test(trimmed)) {
        findings.push({
          detector: "unhandled-async",
          severity: "HIGH",
          file: relPath,
          line: i + 1,
          message: "asyncio.create_task() without capturing result — exceptions are silently lost",
          fix: "Capture the task and add a done callback, or use asyncio.TaskGroup",
          source: trimmed,
        });
      }
    }

    // loop.create_task same pattern
    if (/\.create_task\s*\(/.test(trimmed) && !/asyncio\./.test(trimmed)) {
      if (!/\b\w+\s*=/.test(trimmed)) {
        findings.push({
          detector: "unhandled-async",
          severity: "MEDIUM",
          file: relPath,
          line: i + 1,
          message: "create_task() without capturing result — exceptions may be silently lost",
          fix: "Capture the task and add error handling",
          source: trimmed,
        });
      }
    }
  }

  return findings;
}

