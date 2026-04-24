import { isJsFile } from "../constants";
import type { DetectorResult, Finding } from "../types";
import type { SourceFile } from "../walker";

/**
 * Detect loops that could run forever:
 * - while(true) or for(;;) without break/return in the visible body
 * - Retry loops without max attempt limits
 */
export function detectInfiniteLoopRisk(files: SourceFile[]): DetectorResult {
  const findings: Finding[] = [];

  for (const file of files) {
    if (file.isTest) continue;

    if (isJsFile(file.ext)) {
      findings.push(...detectJsInfiniteLoops(file));
    } else if (file.ext === ".py") {
      findings.push(...detectPythonInfiniteLoops(file));
    } else if (file.ext === ".go") {
      findings.push(...detectGoInfiniteLoops(file));
    }
  }

  return {
    detector: "infinite-loop-risk",
    name: "Infinite Loop Risk",
    description: "Loops that could run forever — missing break conditions or retry limits",
    findings,
  };
}

function detectJsInfiniteLoops(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // while(true), while(1), for(;;)
    if (!/\b(while\s*\(\s*(true|1)\s*\)|for\s*\(\s*;\s*;\s*\))/.test(trimmed)) continue;

    // Scan the loop body for break/return/throw
    let braceDepth = 0;
    let foundOpen = false;
    let hasExit = false;
    let bodyEnd = i;

    for (let j = i; j < Math.min(i + 50, lines.length); j++) {
      for (const ch of lines[j]) {
        if (ch === "{") { foundOpen = true; braceDepth++; }
        if (ch === "}") braceDepth--;
      }

      if (j > i) {
        const bodyLine = lines[j].trim();
        if (/\b(break|return|throw|process\.exit)\b/.test(bodyLine)) {
          hasExit = true;
          break;
        }
      }

      if (foundOpen && braceDepth === 0) {
        bodyEnd = j;
        break;
      }
    }

    if (!hasExit) {
      findings.push({
        detector: "infinite-loop-risk",
        severity: "HIGH",
        file: relPath,
        line: i + 1,
        message: "Infinite loop with no visible break/return — will hang the process",
        fix: "Add a break condition, max iterations counter, or timeout",
        source: trimmed,
      });
    }
  }

  return findings;
}

function detectPythonInfiniteLoops(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  // Track if we're inside a docstring (triple-quoted)
  let inDocstring = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Track docstring state
    const tripleQuotes = (trimmed.match(/"""/g) || []).length + (trimmed.match(/'''/g) || []).length;
    if (tripleQuotes % 2 !== 0) inDocstring = !inDocstring;
    if (inDocstring) continue;

    if (!/^while\s+(True|1)\s*:/.test(trimmed)) continue;

    const loopIndent = lines[i].length - lines[i].trimStart().length;
    let hasExit = false;

    for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) {
      const bodyLine = lines[j].trim();
      const bodyIndent = lines[j].length - lines[j].trimStart().length;

      if (bodyLine !== "" && bodyIndent <= loopIndent) break;

      if (/\b(break|return|raise|sys\.exit)\b/.test(bodyLine)) {
        hasExit = true;
        break;
      }
    }

    if (!hasExit) {
      findings.push({
        detector: "infinite-loop-risk",
        severity: "HIGH",
        file: relPath,
        line: i + 1,
        message: "while True with no visible break/return — will hang the process",
        fix: "Add a break condition, max iterations counter, or timeout",
        source: trimmed,
      });
    }
  }

  return findings;
}

function detectGoInfiniteLoops(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // for { ... } (Go's infinite loop)
    if (trimmed !== "for {") continue;

    let braceDepth = 0;
    let foundOpen = false;
    let hasExit = false;

    for (let j = i; j < Math.min(i + 50, lines.length); j++) {
      for (const ch of lines[j]) {
        if (ch === "{") { foundOpen = true; braceDepth++; }
        if (ch === "}") braceDepth--;
      }

      if (j > i) {
        const bodyLine = lines[j].trim();
        if (/\b(break|return|panic|os\.Exit|select\s*\{)\b/.test(bodyLine)) {
          hasExit = true;
          break;
        }
        // Go channel receive: <-ctx.Done() is an exit condition
        if (/<-/.test(bodyLine)) {
          hasExit = true;
          break;
        }
      }

      if (foundOpen && braceDepth === 0) break;
    }

    if (!hasExit) {
      findings.push({
        detector: "infinite-loop-risk",
        severity: "HIGH",
        file: relPath,
        line: i + 1,
        message: "Infinite for loop with no visible break/return/select — will hang the goroutine",
        fix: "Add a break condition, select with context cancellation, or timeout",
        source: trimmed,
      });
    }
  }

  return findings;
}
