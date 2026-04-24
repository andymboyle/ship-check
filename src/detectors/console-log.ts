import { isJsFile } from "../constants";
import type { DetectorResult, Finding } from "../types";
import type { SourceFile } from "../walker";

/**
 * Detect console.log left in production code.
 * console.error/warn/info are intentional. console.log is almost always leftover debugging.
 */
export function detectConsoleLog(files: SourceFile[]): DetectorResult {
  const findings: Finding[] = [];

  for (const file of files) {
    if (file.isTest) continue;
    if (!isJsFile(file.ext)) continue;

    // Skip files that are clearly debug/dev utilities
    if (file.relPath.includes("debug") || file.relPath.includes("logger")) continue;

    const { lines, relPath } = file;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Skip comments
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

      // Match console.log specifically — not console.error, warn, info, debug, table, etc.
      if (!/\bconsole\.log\s*\(/.test(trimmed)) continue;

      // Skip if it's in a conditional debug block
      const prevLine = i > 0 ? lines[i - 1].trim() : "";
      if (/\bif\s*\(\s*(debug|DEBUG|isDev|isDebug|__DEV__|process\.env\.DEBUG)/.test(prevLine)) continue;

      // Skip if commented out
      if (trimmed.startsWith("//")) continue;

      findings.push({
        detector: "console-log",
        severity: "LOW",
        file: relPath,
        line: i + 1,
        message: "console.log in production code — likely leftover debugging",
        fix: "Remove, or replace with a proper logger if the information is needed",
        source: trimmed.length > 80 ? trimmed.slice(0, 77) + "..." : trimmed,
      });
    }
  }

  return {
    detector: "console-log",
    name: "Console.log in Production",
    description: "console.log left in production code — leftover debugging",
    findings,
  };
}
