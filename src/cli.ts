#!/usr/bin/env node
import { scan, listDetectors } from "./scanner";
import { formatSummary, formatVerbose, formatJSON, formatMarkdown } from "./formatter";

const args = process.argv.slice(2);

// Flags
const jsonMode = args.includes("--json");
const markdownMode = args.includes("--markdown") || args.includes("--md");
const verboseMode = args.includes("--verbose") || args.includes("-v");
const helpMode = args.includes("--help") || args.includes("-h");
const listMode = args.includes("--list");
const ciMode = args.includes("--ci");

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
  audit-kit — find silent errors, missing timeouts, and query problems in your codebase

  Usage:
    npx audit-kit [detectors...] [path] [options]

  Detectors:
${listDetectors().map((d) => `    ${d.id.padEnd(22)} ${d.description}`).join("\n")}

  Options:
    --verbose, -v           Show full details for every finding
    --json                  JSON output
    --markdown, --md        Markdown report
    --severity=HIGH         Only show findings at this severity or above
    --only=<detector>       Run only specific detectors (repeatable)
    --exclude=<pattern>     Skip files/directories matching pattern (repeatable)
    --ci                    Exit code 1 if HIGH findings exist
    --list                  List available detectors
    -h, --help              Show this help message

  Examples:
    npx audit-kit                              Run all detectors (summary)
    npx audit-kit silent-errors                Run one detector
    npx audit-kit --verbose                    Full details
    npx audit-kit --only=silent-errors --only=missing-timeouts
    npx audit-kit src/api/                     Scan a specific directory
    npx audit-kit --md > audit-report.md       Save a report
    npx audit-kit --ci --severity=HIGH         Fail CI on HIGH findings

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

// Output
if (jsonMode) {
  console.log(formatJSON(result));
} else if (markdownMode) {
  console.log(formatMarkdown(result));
} else if (verboseMode) {
  console.log(formatVerbose(result));
} else {
  console.log(formatSummary(result));
}

// CI exit code
if (ciMode) {
  const hasHigh = result.results.some((r) =>
    r.findings.some((f) => f.severity === "HIGH"),
  );
  process.exit(hasHigh ? 1 : 0);
}
