import { isJsFile } from "../constants";
import type { DetectorResult, Finding } from "../types";
import type { SourceFile } from "../walker";

/**
 * Detect SQL injection risks — user-controllable values interpolated into SQL strings.
 * These are almost always wrong. Parameterized queries exist for a reason.
 */
export function detectUnsafeSql(files: SourceFile[]): DetectorResult {
  const findings: Finding[] = [];

  for (const file of files) {
    if (file.isTest) continue;

    if (isJsFile(file.ext)) {
      findings.push(...detectJsUnsafeSql(file));
    } else if (file.ext === ".py") {
      findings.push(...detectPythonUnsafeSql(file));
    }
  }

  return {
    detector: "unsafe-sql",
    name: "Unsafe SQL Construction",
    description: "SQL queries built with string interpolation instead of parameterized queries",
    findings,
  };
}

function detectJsUnsafeSql(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Skip comments
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    // $queryRaw with template literal containing ${} interpolation
    // Prisma: $queryRaw`SELECT * FROM users WHERE id = ${userId}`
    // This bypasses Prisma's parameterization — use $queryRaw(Prisma.sql`...`) instead
    if (/\$queryRaw\s*`/.test(trimmed) && /\$\{/.test(trimmed)) {
      findings.push({
        detector: "unsafe-sql",
        severity: "HIGH",
        file: relPath,
        line: i + 1,
        message: "$queryRaw with template literal interpolation — SQL injection risk",
        fix: "Use Prisma.sql`...` tagged template for parameterized queries: $queryRaw(Prisma.sql`SELECT * FROM users WHERE id = ${userId}`)",
        source: trimmed.length > 80 ? trimmed.slice(0, 77) + "..." : trimmed,
      });
    }

    // $executeRaw with template literal
    if (/\$executeRaw\s*`/.test(trimmed) && /\$\{/.test(trimmed)) {
      findings.push({
        detector: "unsafe-sql",
        severity: "HIGH",
        file: relPath,
        line: i + 1,
        message: "$executeRaw with template literal interpolation — SQL injection risk",
        fix: "Use Prisma.sql`...` tagged template: $executeRaw(Prisma.sql`...`)",
        source: trimmed.length > 80 ? trimmed.slice(0, 77) + "..." : trimmed,
      });
    }

    // Raw SQL string concatenation: "SELECT * FROM " + table
    // or `SELECT * FROM ${table}`
    if (/['"`]SELECT\s/i.test(trimmed) || /['"`]INSERT\s/i.test(trimmed) ||
        /['"`]UPDATE\s/i.test(trimmed) || /['"`]DELETE\s/i.test(trimmed)) {
      // String concatenation with +
      if (/['"`](?:SELECT|INSERT|UPDATE|DELETE)\s[^'"`]*['"`]\s*\+/.test(trimmed)) {
        findings.push({
          detector: "unsafe-sql",
          severity: "HIGH",
          file: relPath,
          line: i + 1,
          message: "SQL query built with string concatenation — SQL injection risk",
          fix: "Use parameterized queries with placeholders ($1, ?, :name)",
          source: trimmed.length > 80 ? trimmed.slice(0, 77) + "..." : trimmed,
        });
      }

      // Template literal with ${} in SQL — require SQL structure (FROM, WHERE, SET, INTO, VALUES)
      if (/`(?:SELECT|INSERT|UPDATE|DELETE)\s[^`]*\$\{/i.test(trimmed) &&
          /\b(FROM|WHERE|SET|INTO|VALUES|JOIN|AND|OR)\b/i.test(trimmed)) {
        // Skip if it's Prisma.sql tagged template (safe)
        if (/Prisma\.sql\s*`/.test(trimmed) || /sql\s*`/.test(trimmed)) continue;

        // HIGH only if interpolation is in a WHERE/SET/VALUES clause (value injection)
        // MEDIUM for table/column name interpolation (structural, less exploitable)
        const hasValueInterpolation =
          /WHERE\s[^`]*\$\{/i.test(trimmed) ||
          /SET\s[^`]*\$\{/i.test(trimmed) ||
          /VALUES\s*\([^)]*\$\{/i.test(trimmed) ||
          /=\s*'\$\{/.test(trimmed) ||
          /=\s*\$\{/.test(trimmed);

        findings.push({
          detector: "unsafe-sql",
          severity: hasValueInterpolation ? "HIGH" : "MEDIUM",
          file: relPath,
          line: i + 1,
          message: hasValueInterpolation
            ? "SQL value interpolation via template literal — SQL injection risk"
            : "SQL table/column name interpolation — verify input is not user-controlled",
          fix: "Use a tagged template (sql`...`) or parameterized query",
          source: trimmed.length > 80 ? trimmed.slice(0, 77) + "..." : trimmed,
        });
      }
    }
  }

  return findings;
}

function detectPythonUnsafeSql(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("#")) continue;

    // f-string SQL: f"SELECT * FROM users WHERE id = {user_id}"
    // Require actual SQL structure — not just "Update the description"
    if (/f['"](?:SELECT|INSERT|UPDATE|DELETE)\s/i.test(trimmed) && /\{/.test(trimmed) &&
        /\b(FROM|WHERE|SET|INTO|VALUES|JOIN|TABLE)\b/i.test(trimmed)) {
      const hasValueInterpolation =
        /WHERE\s.*\{/i.test(trimmed) ||
        /SET\s.*\{/i.test(trimmed) ||
        /VALUES\s*\(.*\{/i.test(trimmed);

      findings.push({
        detector: "unsafe-sql",
        severity: hasValueInterpolation ? "HIGH" : "MEDIUM",
        file: relPath,
        line: i + 1,
        message: hasValueInterpolation
          ? "SQL value interpolation via f-string — SQL injection risk"
          : "SQL with f-string interpolation — verify input is not user-controlled",
        fix: "Use parameterized queries: cursor.execute('SELECT * FROM users WHERE id = %s', (user_id,))",
        source: trimmed.length > 80 ? trimmed.slice(0, 77) + "..." : trimmed,
      });
    }

    // .format() SQL: "SELECT ... WHERE id = {}".format(user_id)
    if (/['"](?:SELECT|INSERT|UPDATE|DELETE)\s[^'"]*\{/.test(trimmed) && /\.format\s*\(/.test(trimmed)) {
      findings.push({
        detector: "unsafe-sql",
        severity: "HIGH",
        file: relPath,
        line: i + 1,
        message: "SQL query built with .format() — SQL injection risk",
        fix: "Use parameterized queries: cursor.execute('SELECT * FROM users WHERE id = %s', (user_id,))",
        source: trimmed.length > 80 ? trimmed.slice(0, 77) + "..." : trimmed,
      });
    }

    // % formatting: "SELECT ... WHERE id = %s" % user_id (without execute's parameterization)
    // Only flag if it's assignment, not cursor.execute(sql, params)
    if (/['"](?:SELECT|INSERT|UPDATE|DELETE)\s[^'"]*%s/.test(trimmed) && /\s%\s/.test(trimmed)) {
      // Skip if this is cursor.execute(sql, (params,)) — that's parameterized
      if (/\.execute\s*\(/.test(trimmed)) continue;

      findings.push({
        detector: "unsafe-sql",
        severity: "HIGH",
        file: relPath,
        line: i + 1,
        message: "SQL query with % string formatting — SQL injection risk",
        fix: "Use parameterized queries: cursor.execute(sql, params) instead of string formatting",
        source: trimmed.length > 80 ? trimmed.slice(0, 77) + "..." : trimmed,
      });
    }
  }

  return findings;
}
