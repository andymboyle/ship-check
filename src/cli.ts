#!/usr/bin/env node
import { scan, listDetectors } from "./scanner";
import { formatSummary, formatVerbose, formatJSON, formatMarkdown } from "./formatter";
import { applyFixes } from "./fixer";

const args = process.argv.slice(2);

// Flags
const jsonMode = args.includes("--json");
const markdownMode = args.includes("--markdown") || args.includes("--md");
const verboseMode = args.includes("--verbose") || args.includes("-v");
const helpMode = args.includes("--help") || args.includes("-h");
const listMode = args.includes("--list");
const ciMode = args.includes("--ci");
const fixMode = args.includes("--fix");

// --severity=HIGH (filter findings)
const severityArg = args.find((a) => a.startsWith("--severity="));
const severityFilter = severityArg?.split("=")[1]?.toUpperCase() ?? null;

// --exclude=pattern (repeatable)
const excludePatterns = args
  .filter((a) => a.startsWith("--exclude="))
  .map((a) => a.slice("--exclude=".length));

// --only=detector-id (repeatable, run specific detectors)
const onlyDetectors = args
  .filter((a) => a.startsWith("--only="))
  .map((a) => a.slice("--only=".length));

// Positional arg: detector name or path
const positional = args.filter(
  (a) => !a.startsWith("--") && !a.startsWith("-"),
);

// Check if positional arg is a detector name or a path
const knownDetectors = new Set(listDetectors().map((d) => d.id));
const detectorArgs = positional.filter((a) => knownDetectors.has(a));
const pathArgs = positional.filter((a) => !knownDetectors.has(a));
const rootDir = pathArgs[0] ?? process.cwd();

if (helpMode) {
  console.log(`
  ship-check — find silent errors, missing timeouts, and query problems in your codebase

  Usage:
    npx ship-check [detectors...] [path] [options]

  Detectors:
${listDetectors().map((d) => `    ${d.id.padEnd(22)} ${d.description}`).join("\n")}

  Options:
    --verbose, -v           Show full details for every finding
    --json                  JSON output
    --markdown, --md        Markdown report
    --severity=HIGH         Only show findings at this severity or above
    --only=<detector>       Run only specific detectors (repeatable)
    --exclude=<pattern>     Skip files/directories matching pattern (repeatable)
    --fix                   Auto-fix findings where possible (currently: missing timeouts)
    --ci                    Exit code 1 if HIGH findings exist
    --list                  List available detectors
    -h, --help              Show this help message

  Examples:
    npx ship-check                              Run all detectors (summary)
    npx ship-check silent-errors                Run one detector
    npx ship-check --verbose                    Full details
    npx ship-check --fix                        Auto-fix what's safe to fix
    npx ship-check missing-timeouts --fix       Fix only timeouts
    npx ship-check --md > audit-report.md       Save a report
    npx ship-check --ci --severity=HIGH         Fail CI on HIGH findings

  Exit codes:
    0  Scan completed (default)
    1  HIGH findings found (only with --ci flag)
  `);
  process.exit(0);
}

if (listMode) {
  console.log("\nAvailable detectors:\n");
  for (const d of listDetectors()) {
    console.log(`  ${d.id.padEnd(22)} ${d.description}`);
  }
  console.log("");
  process.exit(0);
}

// Determine which detectors to run
const selectedDetectors =
  detectorArgs.length > 0
    ? detectorArgs
    : onlyDetectors.length > 0
      ? onlyDetectors
      : undefined;

const result = scan({
  rootDir,
  detectors: selectedDetectors,
  exclude: excludePatterns.length > 0 ? excludePatterns : undefined,
});

// Apply severity filter
if (severityFilter) {
  const severityRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const threshold = severityRank[severityFilter] ?? 2;
  for (const dr of result.results) {
    dr.findings = dr.findings.filter(
      (f) => (severityRank[f.severity] ?? 2) <= threshold,
    );
  }
}

// --fix mode: apply auto-fixes before reporting
if (fixMode) {
  const allFindings = result.results.flatMap((r) => r.findings);
  const fixable = allFindings.filter((f) => f.fixable);

  if (fixable.length === 0) {
    console.log("No auto-fixable findings found.");
  } else {
    console.log(`\n🔧 Applying ${fixable.length} auto-fixes...\n`);
    const fixes = applyFixes(rootDir, allFindings);

    for (const fix of fixes) {
      console.log(`  ✅ ${fix.file}:${fix.line}`);
      console.log(`     - ${fix.before}`);
      console.log(`     + ${fix.after}`);
      console.log("");
    }

    const skipped = fixable.length - fixes.length;
    console.log(`${fixes.length} file(s) fixed.${skipped > 0 ? ` ${skipped} skipped (multi-line or complex calls).` : ""}`);
    console.log("");
  }
}

// Output
if (jsonMode) {
  console.log(formatJSON(result));
} else if (markdownMode) {
  console.log(formatMarkdown(result));
} else if (verboseMode) {
  console.log(formatVerbose(result));
} else if (!fixMode) {
  // Don't show summary after --fix (the fix output is the report)
  console.log(formatSummary(result));
}

// CI exit code
if (ciMode) {
  const hasHigh = result.results.some((r) =>
    r.findings.some((f) => f.severity === "HIGH"),
  );
  process.exit(hasHigh ? 1 : 0);
}
