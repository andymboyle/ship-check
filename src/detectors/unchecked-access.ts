import { isJsFile } from "../constants";
import type { DetectorResult, Finding } from "../types";
import type { SourceFile } from "../walker";

/**
 * Detect patterns that will crash at runtime with no guard:
 * - Array access without length check: arr[0] when arr might be empty
 * - Optional chain followed by non-optional access: obj?.items[0].name
 * - Destructuring from possibly-undefined: const { x } = maybeNull
 */
export function detectUncheckedAccess(files: SourceFile[]): DetectorResult {
  const findings: Finding[] = [];

  for (const file of files) {
    if (file.isTest) continue;
    if (!isJsFile(file.ext)) continue;

    findings.push(...detectJsUncheckedAccess(file));
  }

  return {
    detector: "unchecked-access",
    name: "Unchecked Access",
    description: "Array/object access that will crash if the value is null, undefined, or empty",
    findings,
  };
}

function detectJsUncheckedAccess(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    // Pattern: optional chain followed by non-optional array access
    // e.g., data?.items[0].name — crashes if items is empty
    // e.g., user?.addresses[0] — crashes if addresses is empty
    if (/\?\.\w+\[\d+\]/.test(trimmed)) {
      findings.push({
        detector: "unchecked-access",
        severity: "MEDIUM",
        file: relPath,
        line: i + 1,
        message: "Optional chain followed by array index access — crashes if array is empty",
        fix: "Use optional chain on the array access too: data?.items?.[0]?.name, or check .length first",
        source: trimmed.length > 80 ? trimmed.slice(0, 77) + "..." : trimmed,
      });
    }

    // Pattern: result of .find() used without null check
    // const item = arr.find(x => x.id === id);
    // item.name  ← crashes if find returns undefined
    if (/\.find\s*\(/.test(trimmed)) {
      // Check if the result is used with ! (non-null assertion) or optional chain
      const assignment = trimmed.match(/(?:const|let|var)\s+(\w+)\s*=.*\.find\s*\(/);
      if (assignment) {
        const varName = assignment[1];
        // Check next 5 lines for usage without optional chain or null check
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const nextLine = lines[j].trim();
          // Direct property access: item.name (not item?.name or item?.name)
          const accessPattern = new RegExp(`\\b${varName}\\.(\\w+)(?!\\?)`, "");
          if (accessPattern.test(nextLine) && !nextLine.includes(`${varName}?.`) && !nextLine.includes(`${varName}!.`)) {
            // Skip if there's a null check: if (item) or if (!item)
            const prevLines = lines.slice(i, j + 1).join("\n");
            if (/\bif\s*\(\s*!?\s*\w+\s*\)/.test(prevLines)) continue;

            findings.push({
              detector: "unchecked-access",
              severity: "MEDIUM",
              file: relPath,
              line: j + 1,
              message: `.find() result used without null check — crashes if element not found`,
              fix: `Add a null check: if (${varName}) { ... } or use optional chaining: ${varName}?.property`,
              source: nextLine.length > 80 ? nextLine.slice(0, 77) + "..." : nextLine,
            });
            break;
          }
        }
      }
    }
  }

  return findings;
}
