import { isJsFile } from "../constants";
import type { DetectorResult, Finding } from "../types";
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

    if (isJsFile(file.ext)) {
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

    // Track loop context — only real sequential loops, not .map()/.reduce() (which run in parallel via Promise.all)
    if (/\b(for\s*\(|for\s*\.\.\.|\.forEach\s*\(|while\s*\(|do\s*\{)/.test(trimmed)) {
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

      // N+1: findMany inside a loop — but only if the loop is data-driven
      if (loopDepth > 0) {
        // Check if the loop iterates over a small hardcoded array (not a real N+1 concern)
        const loopLine = loopStartLine >= 0 ? lines[loopStartLine].trim() : "";
        const isSmallFixedLoop = /\bof\s*\[/.test(loopLine) || // for (const x of [a, b, c])
          /\b(in|of)\s+\w+\s*\)/.test(loopLine) && /\bconst\s+\w+\s*=\s*\[/.test(
            lines.slice(Math.max(0, loopStartLine - 5), loopStartLine).join(" ")
          );

        if (!isSmallFixedLoop) {
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
    }

    // findUnique/findFirst inside a loop
    if (/\.(findUnique|findFirst)\s*\(/.test(trimmed) && loopDepth > 0) {
      // Skip small fixed loops
      const loopLine = loopStartLine >= 0 ? lines[loopStartLine].trim() : "";
      const isSmallFixedLoop = /\bof\s*\[/.test(loopLine);
      if (isSmallFixedLoop) continue;

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

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const indent = lines[i].length - lines[i].trimStart().length;

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

    // Query inside a loop — only flag if we can verify a for/while loop above
    // The Python indent-based loop tracking is unreliable, so double-check
    // by scanning the previous 15 lines for an actual loop statement at lower indent
    if (/\.objects\.(filter|get|first|all|create|update|exclude)\s*\(/.test(trimmed)) {
      const queryIndent = indent;
      let foundLoop = false;
      for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
        const prevLine = lines[j].trim();
        const prevIndent = lines[j].length - lines[j].trimStart().length;
        // A for/while at lower indent than the query means the query is inside the loop
        if (/^(for|while)\s+/.test(prevLine) && prevLine.endsWith(":") && prevIndent < queryIndent) {
          foundLoop = true;
          break;
        }
        // Hit a function/class def — stop looking
        if (/^(def|class|async\s+def)\s+/.test(prevLine) && prevIndent < queryIndent) {
          break;
        }
      }
      if (foundLoop) {
        findings.push({
          detector: "unbounded-queries",
          severity: "HIGH",
          file: relPath,
          line: i + 1,
          message: "Django ORM query inside a loop (N+1) — fires a separate query per iteration",
          fix: "Batch the query outside the loop using an IN clause or prefetch_related/selectinload",
          source: trimmed,
        });
      }
    }

  }

  return findings;
}

