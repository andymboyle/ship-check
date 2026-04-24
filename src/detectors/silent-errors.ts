import { isJsFile } from "../constants";
import type { DetectorResult, Finding } from "../types";
import type { SourceFile } from "../walker";

/**
 * Detect silent error swallowing patterns:
 * - Python: except blocks with pass, bare returns, no logging
 * - JS/TS: empty catch blocks, catch with only console.log
 * - Broad exception types (except Exception, catch(e) with no rethrow)
 */
export function detectSilentErrors(files: SourceFile[]): DetectorResult {
  const findings: Finding[] = [];

  for (const file of files) {
    if (file.isTest) continue;

    if (file.ext === ".py") {
      findings.push(...detectPythonSilentErrors(file));
    } else if (isJsFile(file.ext)) {
      findings.push(...detectJsSilentErrors(file));
    } else if (file.ext === ".go") {
      findings.push(...detectGoSilentErrors(file));
    }
  }

  return {
    detector: "silent-errors",
    name: "Silent Error Swallowing",
    description: "Silent error swallowing — catch/except blocks that hide failures",
    findings,
  };
}

// --- Python ---

function detectPythonSilentErrors(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Find except lines — must be an actual except clause
    if (!trimmed.startsWith("except")) continue;
    // Reject "exception", "except_handler", etc.
    if (/^except[a-zA-Z_]/.test(trimmed)) continue;
    // Must end with a colon (possibly after type and "as" clause)
    if (!trimmed.endsWith(":")) continue;

    const exceptLine = i;
    const indent = line.length - line.trimStart().length;

    // Parse exception type
    const typeMatch = trimmed.match(/^except\s+(\w[\w.,\s]*?)(?:\s+as\s+\w+)?:/);
    const exceptionType = typeMatch ? typeMatch[1].trim() : "bare except";

    // Collect the except block body (lines indented more than the except line)
    const bodyLines: { text: string; lineNum: number }[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const bodyLine = lines[j];
      if (bodyLine.trim() === "") continue; // skip blank lines
      const bodyIndent = bodyLine.length - bodyLine.trimStart().length;
      if (bodyIndent <= indent) break; // end of block
      bodyLines.push({ text: bodyLine.trim(), lineNum: j });
    }

    if (bodyLines.length === 0) {
      // Empty except block
      findings.push({
        detector: "silent-errors",
        severity: "HIGH",
        file: relPath,
        line: exceptLine + 1,
        message: `Empty except block (${exceptionType}) — errors silently swallowed`,
        fix: "Add logging: logger.exception() or re-raise the error",
        source: trimmed,
      });
      continue;
    }

    // Check for pass-only
    if (bodyLines.length === 1 && bodyLines[0].text === "pass") {
      findings.push({
        detector: "silent-errors",
        severity: "HIGH",
        file: relPath,
        line: exceptLine + 1,
        message: `except ${exceptionType}: pass — errors completely ignored`,
        fix: "Add logging: logger.exception() or re-raise the error",
        source: trimmed,
      });
      continue;
    }

    // Check for return-without-logging
    const hasLogging = bodyLines.some((l) =>
      /\b(log(ger|ging)?\.?(error|exception|warning|warn|info|critical|debug)|print\s*\(|raise\b|throw\b)/.test(l.text),
    );

    const hasReturn = bodyLines.some((l) =>
      /^return\s+(None|False|\[\]|\{\}|""|\b0\b)/.test(l.text) || l.text === "return" || l.text === "continue",
    );

    if (hasReturn && !hasLogging) {
      const returnLine = bodyLines.find((l) =>
        /^return\s|^return$|^continue$/.test(l.text),
      );
      findings.push({
        detector: "silent-errors",
        severity: exceptionType === "Exception" || exceptionType === "bare except" ? "HIGH" : "MEDIUM",
        file: relPath,
        line: exceptLine + 1,
        message: `except ${exceptionType} returns silently (${returnLine?.text ?? "return"}) — no logging`,
        fix: "Add logger.exception() before the return",
        source: trimmed,
      });
      continue;
    }

    // Check for overly broad exception type with no re-raise
    if (
      (exceptionType === "Exception" || exceptionType === "bare except" || exceptionType === "BaseException") &&
      !bodyLines.some((l) => /\braise\b/.test(l.text))
    ) {
      // Only flag if the block doesn't have logging either
      if (!hasLogging) {
        findings.push({
          detector: "silent-errors",
          severity: "MEDIUM",
          file: relPath,
          line: exceptLine + 1,
          message: `Broad ${exceptionType} without re-raise or logging — unexpected errors masked`,
          fix: "Narrow the exception type or add logger.exception() and re-raise",
          source: trimmed,
        });
      }
    }
  }

  return findings;
}

// --- JavaScript/TypeScript ---

function detectJsSilentErrors(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Find catch blocks: } catch (e) { or } catch {
    if (!/\bcatch\s*(\([^)]*\))?\s*\{/.test(trimmed)) continue;

    const catchLine = i;
    const indent = lines[i].length - lines[i].trimStart().length;

    // Look at the try block above — some patterns are safe to silence
    const tryContext = lines.slice(Math.max(0, i - 10), i).join("\n");
    const isSafeTryPattern =
      /JSON\.parse\b/.test(tryContext) ||           // try to parse JSON, ignore failure
      /\.json\(\)/.test(tryContext) ||               // response.json() that might fail
      /\bdelete\b|\bremove\b|\bclean/i.test(tryContext) || // cleanup/teardown code
      /\bdisconnect\b|\bclose\b|\bdestroy\b/i.test(tryContext) || // connection cleanup
      /\blocalStorage\b|\bsessionStorage\b/.test(tryContext) || // storage access (can throw in Safari private mode)
      /\bnavigator\b/.test(tryContext); // navigator API (clipboard, etc. — can throw)

    // Collect the catch block body
    // Track brace depth to find the end of the catch block
    let braceDepth = 0;
    let foundOpen = false;
    const bodyLines: { text: string; lineNum: number }[] = [];

    for (let j = i; j < lines.length; j++) {
      const line = lines[j];
      for (const ch of line) {
        if (ch === "{") {
          if (foundOpen) braceDepth++;
          else { foundOpen = true; braceDepth = 1; }
        }
        if (ch === "}") braceDepth--;
      }

      if (j > i) {
        const t = line.trim();
        if (t && t !== "}" && t !== "});") {
          bodyLines.push({ text: t, lineNum: j });
        }
      }

      if (foundOpen && braceDepth === 0) break;
    }

    // Empty catch block — downgrade to MEDIUM if the try block is a safe pattern
    if (bodyLines.length === 0) {
      if (!isSafeTryPattern) {
        findings.push({
          detector: "silent-errors",
          severity: "HIGH",
          file: relPath,
          line: catchLine + 1,
          message: "Empty catch block — errors silently swallowed",
          fix: "Add error handling: log the error or re-throw",
          source: trimmed,
        });
      } else {
        findings.push({
          detector: "silent-errors",
          severity: "LOW",
          file: relPath,
          line: catchLine + 1,
          message: "Empty catch block on safe pattern (JSON parse/cleanup) — likely intentional",
          fix: "Add a comment explaining why the error is ignored, or add minimal logging",
          source: trimmed,
        });
      }
      continue;
    }

    // Catch block with only console.log
    const hasProperHandling = bodyLines.some((l) =>
      /\b(throw|logger|logging|Sentry|captureException|reportError|console\.(error|warn)|process\.exit)\b/.test(l.text),
    );

    const onlyConsoleLog = bodyLines.every((l) =>
      /^console\.log\b/.test(l.text) || /^\/\//.test(l.text),
    );

    if (onlyConsoleLog && bodyLines.length > 0) {
      findings.push({
        detector: "silent-errors",
        severity: "MEDIUM",
        file: relPath,
        line: catchLine + 1,
        message: "Catch block only has console.log — errors not properly handled",
        fix: "Use console.error, a logger, or Sentry. Re-throw if the error should propagate.",
        source: trimmed,
      });
      continue;
    }

    // Return null/undefined without logging
    const hasReturn = bodyLines.some((l) =>
      /^return\s*(null|undefined|\[\]|\{\}|""|''|``|void\s|;?\s*$)/.test(l.text) || l.text === "return;",
    );

    if (hasReturn && !hasProperHandling) {
      findings.push({
        detector: "silent-errors",
        severity: "MEDIUM",
        file: relPath,
        line: catchLine + 1,
        message: "Catch block returns empty value without logging — errors hidden from callers",
        fix: "Add console.error or a logger before the return",
        source: trimmed,
      });
    }
  }

  return findings;
}

// --- Go ---

function detectGoSilentErrors(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Go pattern: if err != nil { ... }
    if (!/^if\s+.*err\s*!=\s*nil\s*\{/.test(trimmed)) continue;

    const errLine = i;

    // Collect body
    let braceDepth = 0;
    let foundOpen = false;
    const bodyLines: { text: string; lineNum: number }[] = [];

    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === "{") { foundOpen = true; braceDepth++; }
        if (ch === "}") braceDepth--;
      }

      if (j > i) {
        const t = lines[j].trim();
        if (t && t !== "}") {
          bodyLines.push({ text: t, lineNum: j });
        }
      }

      if (foundOpen && braceDepth === 0) break;
    }

    // Empty error handling block
    if (bodyLines.length === 0) {
      findings.push({
        detector: "silent-errors",
        severity: "HIGH",
        file: relPath,
        line: errLine + 1,
        message: "Empty error handling block — error silently ignored",
        fix: "At minimum log the error, or return it to the caller",
        source: trimmed,
      });
      continue;
    }

    // Only has a bare return (no wrapping, no logging)
    const hasLogging = bodyLines.some((l) =>
      /\b(log\.|fmt\.(Print|Fprint|Sprint)|errors\.(Wrap|New)|return\s+.*err)/.test(l.text),
    );

    if (!hasLogging && bodyLines.length === 1 && bodyLines[0].text === "return") {
      findings.push({
        detector: "silent-errors",
        severity: "MEDIUM",
        file: relPath,
        line: errLine + 1,
        message: "Error handled with bare return — error value discarded",
        fix: "Return the error: return err, or wrap it: return fmt.Errorf(\"context: %w\", err)",
        source: trimmed,
      });
    }
  }

  return findings;
}

