import type { ScanResult, DetectorResult, Finding } from "./types";

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";

function severityColor(severity: string): string {
  switch (severity) {
    case "HIGH": return RED;
    case "MEDIUM": return YELLOW;
    case "LOW": return DIM;
    default: return DIM;
  }
}

function severityIcon(severity: string): string {
  switch (severity) {
    case "HIGH": return "🔴";
    case "MEDIUM": return "🟡";
    case "LOW": return "⚪";
    default: return "⚪";
  }
}

/**
 * Format a scan result as a compact terminal summary (default mode).
 */
export function formatSummary(result: ScanResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(`${BOLD}🔍 ship-check${RESET}`);
  lines.push("");

  const totalFindings = result.results.reduce((sum, r) => sum + r.findings.length, 0);

  if (totalFindings === 0) {
    lines.push(`${GREEN}✅ No issues found.${RESET}`);
    lines.push("");
    lines.push(`${DIM}Scanned ${result.filesScanned} files in ${formatDuration(result.duration)}.${RESET}`);
    lines.push("");
    return lines.join("\n");
  }

  // Detector summaries
  for (const dr of result.results) {
    if (dr.findings.length === 0) {
      lines.push(`${GREEN}✅ ${dr.detector}${RESET} ${DIM}— no issues${RESET}`);
      continue;
    }

    const high = dr.findings.filter((f) => f.severity === "HIGH").length;
    const medium = dr.findings.filter((f) => f.severity === "MEDIUM").length;
    const low = dr.findings.filter((f) => f.severity === "LOW").length;

    const counts: string[] = [];
    if (high > 0) counts.push(`${RED}${high} HIGH${RESET}`);
    if (medium > 0) counts.push(`${YELLOW}${medium} MEDIUM${RESET}`);
    if (low > 0) counts.push(`${DIM}${low} LOW${RESET}`);

    lines.push(`${BOLD}${dr.detector}${RESET} — ${counts.join(", ")}`);
    lines.push(`${DIM}  ${dr.description}${RESET}`);

    // Show top 3 findings
    const topFindings = [...dr.findings]
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
      .slice(0, 3);

    for (const f of topFindings) {
      const icon = severityIcon(f.severity);
      lines.push(`  ${icon} ${f.file}:${f.line} — ${f.message}`);
    }

    if (dr.findings.length > 3) {
      lines.push(`${DIM}  ...and ${dr.findings.length - 3} more${RESET}`);
    }
    lines.push("");
  }

  // Summary
  const allHigh = result.results.reduce((s, r) => s + r.findings.filter((f) => f.severity === "HIGH").length, 0);
  const allMedium = result.results.reduce((s, r) => s + r.findings.filter((f) => f.severity === "MEDIUM").length, 0);
  const allLow = result.results.reduce((s, r) => s + r.findings.filter((f) => f.severity === "LOW").length, 0);

  lines.push(`${BOLD}Summary${RESET}`);
  lines.push(`${DIM}${result.filesScanned} files scanned in ${formatDuration(result.duration)}${RESET}`);
  lines.push(`${totalFindings} findings: ${RED}${allHigh} HIGH${RESET}, ${YELLOW}${allMedium} MEDIUM${RESET}, ${DIM}${allLow} LOW${RESET}`);
  lines.push("");
  lines.push(`${DIM}Run with --verbose for full details, or --md to save a report.${RESET}`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Format with full details for every finding (--verbose).
 */
export function formatVerbose(result: ScanResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(`${BOLD}🔍 ship-check${RESET}`);
  lines.push("");

  for (const dr of result.results) {
    if (dr.findings.length === 0) continue;

    lines.push(`${BOLD}${CYAN}━━━ ${dr.name ?? dr.detector} ━━━${RESET}`);
    lines.push(`${DIM}${dr.description}${RESET}`);
    lines.push("");

    const sorted = [...dr.findings].sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity),
    );

    for (const f of sorted) {
      const color = severityColor(f.severity);
      lines.push(`${color}${f.severity}${RESET}  ${f.file}:${f.line}`);
      lines.push(`      ${f.message}`);
      lines.push(`${DIM}      Fix: ${f.fix}${RESET}`);
      if (f.source) {
        lines.push(`${DIM}      > ${f.source}${RESET}`);
      }
      lines.push("");
    }
  }

  // Summary
  const totalFindings = result.results.reduce((s, r) => s + r.findings.length, 0);
  lines.push(`${BOLD}Summary${RESET}`);
  lines.push(`${DIM}${result.filesScanned} files scanned in ${formatDuration(result.duration)}${RESET}`);
  lines.push(`${totalFindings} total findings`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Format as Markdown (--md).
 */
export function formatMarkdown(result: ScanResult): string {
  const lines: string[] = [];

  lines.push("# ship-check report");
  lines.push("");

  const totalFindings = result.results.reduce((s, r) => s + r.findings.length, 0);

  if (totalFindings === 0) {
    lines.push("**No issues found.**");
    lines.push("");
    lines.push(`Scanned ${result.filesScanned} files in ${formatDuration(result.duration)}.`);
    return lines.join("\n");
  }

  lines.push(`Scanned ${result.filesScanned} files in ${formatDuration(result.duration)}. ${totalFindings} findings.`);
  lines.push("");

  for (const dr of result.results) {
    if (dr.findings.length === 0) continue;

    const high = dr.findings.filter((f) => f.severity === "HIGH").length;
    const medium = dr.findings.filter((f) => f.severity === "MEDIUM").length;
    const low = dr.findings.filter((f) => f.severity === "LOW").length;

    lines.push(`## ${dr.name ?? dr.detector} (${dr.findings.length})`);
    lines.push("");
    lines.push(`${dr.description}`);
    lines.push("");
    lines.push(`| Severity | Count |`);
    lines.push(`|----------|-------|`);
    if (high > 0) lines.push(`| HIGH | ${high} |`);
    if (medium > 0) lines.push(`| MEDIUM | ${medium} |`);
    if (low > 0) lines.push(`| LOW | ${low} |`);
    lines.push("");

    const sorted = [...dr.findings].sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity),
    );

    for (const f of sorted) {
      const icon = f.severity === "HIGH" ? "🔴" : f.severity === "MEDIUM" ? "🟡" : "⚪";
      lines.push(`### ${icon} \`${f.file}:${f.line}\``);
      lines.push("");
      lines.push(f.message);
      lines.push("");
      lines.push(`**Fix:** ${f.fix}`);
      if (f.source) {
        lines.push("");
        lines.push("```");
        lines.push(f.source);
        lines.push("```");
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Format as JSON (--json).
 */
export function formatJSON(result: ScanResult): string {
  return JSON.stringify(
    {
      results: result.results,
      summary: {
        filesScanned: result.filesScanned,
        duration: result.duration,
        totalFindings: result.results.reduce((s, r) => s + r.findings.length, 0),
        high: result.results.reduce((s, r) => s + r.findings.filter((f) => f.severity === "HIGH").length, 0),
        medium: result.results.reduce((s, r) => s + r.findings.filter((f) => f.severity === "MEDIUM").length, 0),
        low: result.results.reduce((s, r) => s + r.findings.filter((f) => f.severity === "LOW").length, 0),
      },
    },
    null,
    2,
  );
}

function severityRank(s: string): number {
  switch (s) {
    case "HIGH": return 0;
    case "MEDIUM": return 1;
    case "LOW": return 2;
    default: return 3;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
