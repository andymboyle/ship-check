import { isJsFile } from "../constants";
import type { DetectorResult, Finding } from "../types";
import type { SourceFile } from "../walker";

/**
 * Detect raw error messages/tracebacks being shown to users:
 * - error.message rendered in JSX/templates
 * - Python tracebacks in HTTP responses
 * - Stack traces in API responses
 */
export function detectRawErrors(files: SourceFile[]): DetectorResult {
  const findings: Finding[] = [];

  for (const file of files) {
    if (file.isTest) continue;

    if (isJsFile(file.ext)) {
      findings.push(...detectJsRawErrors(file));
    } else if (file.ext === ".py") {
      findings.push(...detectPythonRawErrors(file));
    }
  }

  return {
    detector: "raw-errors",
    name: "Raw Error Leaks",
    description: "Raw error leaks — technical error messages, stack traces, and tracebacks shown to users",
    findings,
  };
}

// --- JavaScript/TypeScript ---

function detectJsRawErrors(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // error.message in JSX (rendered to users)
    // Only match explicit error variable names — "e" is too broad (could be event, email, etc.)
    if (/\{[^}]*\b(error|err)\.message\b[^}]*\}/.test(trimmed)) {
      // Skip server-side logging — logger.error, console.error, etc. are fine
      if (/\b(logger|log|console)\.(error|warn|info|debug|exception)\b/.test(trimmed)) continue;
      if (/\bthis\.logger\b/.test(trimmed)) continue;
      // Skip i18n-wrapped messages — {t(error.message)} goes through translation
      if (/\bt\(\s*(error|err)\.message\s*\)/.test(trimmed)) continue;

      // Require strong JSX context — must be inside a return with actual JSX elements
      const context = lines.slice(Math.max(0, i - 5), Math.min(i + 5, lines.length)).join("\n");
      const isJsx = /<\w/.test(context) && (/className/.test(context) || /<\//.test(context));

      if (isJsx) {
        // Downgrade error boundaries/fallback components — these are developer-facing
        const isErrorBoundary = /ErrorBoundary|ErrorFallback|error[_-]?fallback|error[_-]?boundary/i.test(
          lines.slice(Math.max(0, i - 15), i).join("\n"),
        );

        findings.push({
          detector: "raw-errors",
          severity: isErrorBoundary ? "MEDIUM" : "HIGH",
          file: relPath,
          line: i + 1,
          message: isErrorBoundary
            ? "error.message in error boundary — consider a user-friendly fallback"
            : "Raw error.message rendered in UI — users see technical error strings",
          fix: "Use a user-friendly message: \"Something went wrong. Please try again.\" Log the real error separately.",
          source: trimmed,
        });
      }
    }

    // error.stack in UI — skip logging
    if (/\{[^}]*\b(error|err)\.stack\b[^}]*\}/.test(trimmed)) {
      if (/\b(logger|log|console)\.(error|warn|info|debug|exception)\b/.test(trimmed)) continue;
      if (/\bthis\.logger\b/.test(trimmed)) continue;

      const context = lines.slice(Math.max(0, i - 5), Math.min(i + 5, lines.length)).join("\n");
      const isJsx = /<\w/.test(context) && (/className/.test(context) || /<\//.test(context));

      if (isJsx) {
        findings.push({
          detector: "raw-errors",
          severity: "HIGH",
          file: relPath,
          line: i + 1,
          message: "Stack trace rendered in UI — exposes internals to users",
          fix: "Never show stack traces to users. Log them server-side.",
          source: trimmed,
        });
      }
    }

    // toast/notification with error.message
    if (/\b(toast|notify|notification|alert|showError|addToast)\s*\(/.test(trimmed)) {
      if (/\b(error|err)\.(message|toString\(\))/.test(trimmed)) {
        findings.push({
          detector: "raw-errors",
          severity: "MEDIUM",
          file: relPath,
          line: i + 1,
          message: "Raw error.message in toast/notification — users see technical errors",
          fix: "Show a generic message to users, log the technical details",
          source: trimmed,
        });
      }
    }

    // JSON response with raw error
    if (/\bres\.(json|send|status)\b.*\b(error|err)\.(message|stack)/.test(trimmed)) {
      findings.push({
        detector: "raw-errors",
        severity: "MEDIUM",
        file: relPath,
        line: i + 1,
        message: "Raw error details in API response — leaks internals to clients",
        fix: "Return a generic error message. Log the full error server-side.",
        source: trimmed,
      });
    }

    // String interpolation with error in user-facing strings
    if (/`[^`]*\$\{[^}]*(error|err)\.(message|stack)[^}]*\}[^`]*`/.test(trimmed)) {
      const context = lines.slice(Math.max(0, i - 3), Math.min(i + 3, lines.length)).join("\n");
      const isUiFacing = /\b(toast|alert|modal|render|return\s*\(|<\w|innerHTML|textContent)\b/.test(context);
      if (isUiFacing) {
        findings.push({
          detector: "raw-errors",
          severity: "MEDIUM",
          file: relPath,
          line: i + 1,
          message: "Error message interpolated into user-facing string",
          fix: "Use a generic message for users, log the technical error separately",
          source: trimmed,
        });
      }
    }
  }

  return findings;
}

// --- Python ---

function detectPythonRawErrors(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // traceback.format_exc() in HTTP response
    if (/traceback\.format_exc\(\)/.test(trimmed)) {
      const context = lines.slice(Math.max(0, i - 5), Math.min(i + 5, lines.length)).join("\n");
      if (/\b(response|jsonify|JsonResponse|return|HTTPException|Response)\b/.test(context)) {
        findings.push({
          detector: "raw-errors",
          severity: "HIGH",
          file: relPath,
          line: i + 1,
          message: "Python traceback sent in HTTP response — exposes internals to users",
          fix: "Log the traceback server-side, return a generic error message",
          source: trimmed,
        });
      }
    }

    // str(e) or repr(e) in response
    if (/\b(str|repr)\s*\(\s*(e|err|error|exc|exception)\s*\)/.test(trimmed)) {
      const context = lines.slice(Math.max(0, i - 3), Math.min(i + 3, lines.length)).join("\n");
      if (/\b(response|jsonify|JsonResponse|return|HTTPException|Response)\b/.test(context)) {
        findings.push({
          detector: "raw-errors",
          severity: "MEDIUM",
          file: relPath,
          line: i + 1,
          message: "str(exception) in response — users see raw Python error strings",
          fix: "Return a user-friendly message, log the exception with logger.exception()",
          source: trimmed,
        });
      }
    }

    // DEBUG=True in production settings
    if (/\bDEBUG\s*=\s*True\b/.test(trimmed)) {
      if (relPath.includes("prod") || relPath.includes("settings")) {
        findings.push({
          detector: "raw-errors",
          severity: "HIGH",
          file: relPath,
          line: i + 1,
          message: "DEBUG=True in production config — exposes full tracebacks to users",
          fix: "Set DEBUG=False in production, use DEBUG=os.environ.get('DEBUG', 'False') == 'True'",
          source: trimmed,
        });
      }
    }
  }

  return findings;
}

