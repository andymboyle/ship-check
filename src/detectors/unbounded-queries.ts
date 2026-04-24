import type { Detector, DetectorResult, Finding } from "../types";
import type { SourceFile } from "../walker";

/**
 * Detect database queries that could cause performance problems:
 * - findMany/select without LIMIT/pagination
 * - ORM queries inside loops (N+1)
 * - SELECT * when only a few columns are needed
 */
export function detectUnboundedQueries(files: SourceFile[]): DetectorResult {
  const findings: Finding[] = [];

  for (const file of files) {
    if (file.isTest) continue;

    if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(file.ext)) {
      findings.push(...detectJsQueryIssues(file));
    } else if (file.ext === ".py") {
      findings.push(...detectPythonQueryIssues(file));
    }
  }

  return {
    detector: "unbounded-queries",
    name: "Unbounded Queries",
    description: "Unbounded queries — missing pagination, N+1 loops, over-fetching columns",
    findings,
  };
}

// --- JavaScript/TypeScript (Prisma, Sequelize, TypeORM, Drizzle) ---

function detectJsQueryIssues(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  // Track if we're inside a loop
  let loopDepth = 0;
  let loopStartLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Track loop context
    if (/\b(for\s*\(|\.forEach\s*\(|\.map\s*\(|while\s*\(|\.reduce\s*\()/.test(trimmed)) {
      if (loopDepth === 0) loopStartLine = i;
      loopDepth++;
    }
    // Rough brace tracking for loop exit
    const opens = (trimmed.match(/\{/g) || []).length;
    const closes = (trimmed.match(/\}/g) || []).length;
    if (loopDepth > 0 && closes > opens) {
      loopDepth = Math.max(0, loopDepth - (closes - opens));
    }

    // Prisma findMany without take/skip
    if (/\.findMany\s*\(/.test(trimmed)) {
      // Check surrounding context for take/skip/cursor pagination
      const context = lines.slice(i, Math.min(i + 15, lines.length)).join(" ");
      const hasPagination = /\b(take|skip|cursor|limit)\s*:/.test(context);

      if (!hasPagination) {
        findings.push({
          detector: "unbounded-queries",
          severity: "LOW",
          file: relPath,
          line: i + 1,
          message: "findMany() without take/skip — returns all rows, grows unbounded with data",
          fix: "Add take: 100 (or appropriate limit) and implement pagination",
          source: trimmed,
        });
      }

      // N+1: findMany inside a loop
      if (loopDepth > 0) {
        findings.push({
          detector: "unbounded-queries",
          severity: "HIGH",
          file: relPath,
          line: i + 1,
          message: "Database query inside a loop (N+1) — each iteration fires a separate query",
          fix: "Batch the query outside the loop using findMany with an IN clause, or use include/join",
          source: trimmed,
        });
      }
    }

    // findUnique/findFirst inside a loop
    if (/\.(findUnique|findFirst)\s*\(/.test(trimmed) && loopDepth > 0) {
      findings.push({
        detector: "unbounded-queries",
        severity: "HIGH",
        file: relPath,
        line: i + 1,
        message: "Single-record query inside a loop (N+1) — batch into one findMany with where: { id: { in: ids } }",
        fix: "Collect IDs first, then query once with findMany({ where: { id: { in: ids } } })",
        source: trimmed,
      });
    }

    // findMany without select (potential over-fetching)
    if (/\.findMany\s*\(\s*\{/.test(trimmed)) {
      const context = lines.slice(i, Math.min(i + 15, lines.length)).join(" ");
      if (!/\bselect\s*:/.test(context) && !/\binclude\s*:/.test(context)) {
        findings.push({
          detector: "unbounded-queries",
          severity: "LOW",
          file: relPath,
          line: i + 1,
          message: "findMany() without select — loads all columns. Add select to fetch only needed fields.",
          fix: "Add select: { id: true, name: true, ... } with only the fields you use",
          source: trimmed,
        });
      }
    }

    // Raw SQL without LIMIT
    if (/\$queryRaw|\.raw\(|\.query\(/.test(trimmed)) {
      const context = lines.slice(i, Math.min(i + 5, lines.length)).join(" ").toUpperCase();
      if (/\bSELECT\b/.test(context) && !/\bLIMIT\b/.test(context) && !/\bCOUNT\b/.test(context)) {
        findings.push({
          detector: "unbounded-queries",
          severity: "MEDIUM",
          file: relPath,
          line: i + 1,
          message: "Raw SQL SELECT without LIMIT — could return unbounded rows",
          fix: "Add LIMIT clause or use pagination",
          source: trimmed,
        });
      }
    }
  }

  return findings;
}

// --- Python (SQLAlchemy, Django ORM) ---

function detectPythonQueryIssues(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  let loopDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const indent = lines[i].length - lines[i].trimStart().length;

    // Track loop context (Python uses indentation)
    if (/^(for|while)\s+/.test(trimmed) && trimmed.endsWith(":")) {
      loopDepth++;
    }

    // .all() without limit (Django/SQLAlchemy)
    if (/\.all\(\)/.test(trimmed) && !/\.limit\(|\.first\(|\[:/.test(trimmed)) {
      const context = lines.slice(Math.max(0, i - 2), Math.min(i + 3, lines.length)).join(" ");
      // Skip if there's a limit/slice/filter nearby
      if (!/\blimit\b|\bfirst\b|\b\[:\b|\bpaginate\b/.test(context)) {
        findings.push({
          detector: "unbounded-queries",
          severity: "MEDIUM",
          file: relPath,
          line: i + 1,
          message: ".all() without limit — returns every row in the table",
          fix: "Add .limit(100) or implement pagination with .offset()/.limit()",
          source: trimmed,
        });
      }
    }

    // Query inside a loop
    if (loopDepth > 0 && /\.(filter|get|first|all|execute)\s*\(/.test(trimmed)) {
      // Check it's a query method, not just any .get()
      const context = lines.slice(Math.max(0, i - 3), i + 1).join(" ");
      if (/\b(session|query|objects|Model|cursor|db)\b/.test(context)) {
        findings.push({
          detector: "unbounded-queries",
          severity: "HIGH",
          file: relPath,
          line: i + 1,
          message: "Database query inside a loop (N+1) — fires a separate query per iteration",
          fix: "Batch the query outside the loop using an IN clause or prefetch_related/selectinload",
          source: trimmed,
        });
      }
    }

    // Rough dedent detection for loop exit
    if (loopDepth > 0 && trimmed !== "" && indent === 0) {
      loopDepth = 0;
    }
  }

  return findings;
}

export const unboundedQueriesDetector: Detector = {
  id: "unbounded-queries",
  name: "Unbounded Queries",
  description: "Find queries without pagination, N+1 loops, and column over-fetching",
  languages: ["python", "javascript", "typescript"],
  run(rootDir: string) {
    throw new Error("Use detectUnboundedQueries(files) instead");
  },
};
