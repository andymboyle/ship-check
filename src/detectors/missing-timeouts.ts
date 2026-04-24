import { isJsFile } from "../constants";
import type { DetectorResult, Finding } from "../types";
import type { SourceFile } from "../walker";

/**
 * Detect HTTP clients, SDK calls, and DB connections without timeout configuration.
 * A missing timeout means a downstream outage cascades into your service hanging forever.
 */
export function detectMissingTimeouts(files: SourceFile[]): DetectorResult {
  const findings: Finding[] = [];

  for (const file of files) {
    if (file.isTest) continue;

    if (file.ext === ".py") {
      findings.push(...detectPythonTimeouts(file));
    } else if (isJsFile(file.ext)) {
      findings.push(...detectJsTimeouts(file));
    } else if (file.ext === ".go") {
      findings.push(...detectGoTimeouts(file));
    }
  }

  return {
    detector: "missing-timeouts",
    name: "Missing Timeouts",
    description: "Missing timeouts — HTTP clients, SDK calls, and DB connections that could hang forever",
    findings,
  };
}

// --- Patterns for Python ---

const PYTHON_PATTERNS: {
  pattern: RegExp;
  service: string;
  fix: string;
  timeoutParam: string;
  fixId?: string;
}[] = [
  {
    pattern: /httpx\.(?:AsyncClient|Client)\s*\(/,
    service: "httpx",
    fix: "Add timeout=30.0 to the constructor",
    timeoutParam: "timeout",
    fixId: "httpx-no-timeout",
  },
  {
    pattern: /requests\.(get|post|put|patch|delete|head|options)\s*\(/,
    service: "requests",
    fix: "Add timeout=30 to the call",
    timeoutParam: "timeout",
    fixId: "requests-no-timeout",
  },
  {
    pattern: /aiohttp\.ClientSession\s*\(/,
    service: "aiohttp",
    fix: "Add timeout=aiohttp.ClientTimeout(total=30) to the constructor",
    timeoutParam: "timeout",
    fixId: "aiohttp-no-timeout",
  },
  {
    pattern: /redis\.(?:Redis|StrictRedis)\s*\(/,
    service: "Redis",
    fix: "Add socket_timeout=5, socket_connect_timeout=5",
    timeoutParam: "socket_timeout",
    fixId: "redis-py-no-timeout",
  },
  {
    pattern: /create_engine\s*\(/,
    service: "SQLAlchemy",
    fix: "Add pool_timeout=30, connect_args={'connect_timeout': 10}",
    timeoutParam: "pool_timeout",
    // Not auto-fixable — create_engine has complex args
  },
];

function detectPythonTimeouts(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const p of PYTHON_PATTERNS) {
      if (!p.pattern.test(line)) continue;

      // Check if timeout is specified on this line or the next few lines (multi-line calls)
      const context = lines.slice(i, Math.min(i + 6, lines.length)).join(" ");
      if (context.includes(p.timeoutParam)) continue;

      findings.push({
        detector: "missing-timeouts",
        severity: "HIGH",
        file: relPath,
        line: i + 1,
        message: `${p.service} call without timeout — will hang indefinitely on downstream outage`,
        fix: p.fix,
        source: line.trim(),
        fixable: !!p.fixId,
        _fixId: p.fixId,
      });
    }
  }

  return findings;
}

// --- Patterns for JavaScript/TypeScript ---

const JS_PATTERNS: {
  pattern: RegExp;
  service: string;
  fix: string;
  timeoutIndicators: string[];
  fixId?: string;
}[] = [
  {
    pattern: /\bfetch\s*\(/,
    service: "fetch",
    fix: "Add { signal: AbortSignal.timeout(30_000) } to the options",
    timeoutIndicators: ["AbortSignal", "signal", "timeout", "AbortController"],
    fixId: "fetch-no-timeout",
  },
  {
    pattern: /axios\.create\s*\(/,
    service: "axios",
    fix: "Add timeout: 30_000 to the config",
    timeoutIndicators: ["timeout"],
    fixId: "axios-create-no-timeout",
  },
  {
    pattern: /axios\.(get|post|put|patch|delete)\s*\(/,
    service: "axios",
    fix: "Add { timeout: 30_000 } to the config parameter",
    timeoutIndicators: ["timeout"],
    // Not auto-fixable — per-call axios has variable arg positions
  },
  {
    pattern: /new\s+Redis\s*\(/,
    service: "Redis (ioredis)",
    fix: "Add connectTimeout: 5000 to the config",
    timeoutIndicators: ["connectTimeout", "commandTimeout"],
    fixId: "ioredis-no-timeout",
  },
  {
    pattern: /createClient\s*\(\s*\{/,
    service: "Redis (node-redis)",
    fix: "Add socket: { connectTimeout: 5000 }",
    timeoutIndicators: ["connectTimeout", "socket_timeout"],
    // Not auto-fixable — nested config structure
  },
];

function detectJsTimeouts(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  // Skip type definition files — they declare signatures, not make calls
  if (relPath.endsWith(".d.ts")) return findings;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comment lines, imports, type definitions, string mentions, and JSDoc
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    if (trimmed.startsWith("import ") || trimmed.startsWith("export type") || trimmed.startsWith("export interface")) continue;
    if (trimmed.startsWith("declare ")) continue;
    if (trimmed.startsWith("return \"") || trimmed.startsWith("return '") || trimmed.startsWith("return `")) continue;
    // Type annotations: fetch(input: string, ...): Promise<...>
    if (/^\w+\s*\(.*\)\s*:\s*(Promise|void|boolean|string|number)/.test(trimmed) && !/await|=/.test(trimmed)) continue;

    for (const p of JS_PATTERNS) {
      if (!p.pattern.test(line)) continue;

      // Check the call site for timeout configuration (this line + next 5 for multi-line calls)
      const contextEnd = Math.min(lines.length, i + 6);
      const context = lines.slice(i, contextEnd).join(" ");

      if (p.timeoutIndicators.some((t) => context.includes(t))) continue;

      // For fetch: extensive filtering to reduce false positives
      if (p.service === "fetch") {
        // Not an actual fetch() call — method on another object (.fetch() as data loader)
        if (/\w+\.\w+\.fetch\s*\(/.test(trimmed) && !/\bfetch\s*\(["'`]/.test(trimmed)) continue;
        // Bun.serve / CF Worker fetch handler (request handler, not outbound call)
        if (/\bfetch\s*\(\s*(request|req)\b/.test(trimmed)) continue;
        // fetch() inside a string literal, comment, or type declaration
        if (/["'`].*fetch\s*\(.*["'`]/.test(trimmed)) continue;
        if (/createClient\s*\(/.test(trimmed)) continue;
        if (/declare\s/.test(trimmed) || /:\s*\(/.test(trimmed)) continue;

        // Relative/same-origin URLs — browser or internal, low risk
        if (/fetch\s*\(\s*["'`]\//.test(trimmed)) continue;  // fetch("/api/...")
        if (/fetch\s*\(\s*["'`]\.\//.test(trimmed)) continue; // fetch("./data")
        // Template literals with relative URLs
        if (/fetch\s*\(\s*`\$\{.*\}\//.test(trimmed) && !/https?:/.test(trimmed)) continue;

        // Font/image/asset loading
        if (/\.(ttf|woff|woff2|otf|png|jpg|svg|css)\b/.test(trimmed)) continue;
        // Localhost/loopback calls (local services, dev tools)
        if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(trimmed)) continue;

        // Only flag as HIGH if URL is explicitly external (https://...)
        // or if we're in server-side code (no browser safety net)
        const isExternalUrl = /fetch\s*\(\s*["'`]https?:\/\//.test(trimmed);
        const isUrlVariable = /fetch\s*\(\s*[a-zA-Z]/.test(trimmed) && !/fetch\s*\(\s*(request|req|input)\b/.test(trimmed);

        if (!file.isServerSide && !isExternalUrl) {
          // Browser-side fetch to non-explicit URL — skip entirely
          // Browser has its own timeout behavior
          continue;
        }
      }

      // For axios: skip browser-side, localhost, and same-origin patterns
      if (p.service.startsWith("axios")) {
        if (!file.isServerSide && !/https?:\/\//.test(context)) continue;
        if (/localhost|127\.0\.0\.1/.test(context)) continue;
      }

      // For Redis createClient: require redis import context (not trpc/graphql createClient)
      if (p.service === "Redis (node-redis)") {
        const fileContext = lines.slice(0, Math.min(20, lines.length)).join("\n");
        if (!/\bredis\b/i.test(fileContext)) continue;
      }

      findings.push({
        detector: "missing-timeouts",
        severity: "HIGH",
        file: relPath,
        line: i + 1,
        message: `${p.service} call without timeout — will hang indefinitely on downstream outage`,
        fix: p.fix,
        source: trimmed,
        fixable: !!p.fixId,
        _fixId: p.fixId,
      });
    }
  }

  return findings;
}

// --- Patterns for Go ---

function detectGoTimeouts(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // http.Client{} without Timeout
    if (/&?http\.Client\s*\{/.test(line)) {
      const context = lines.slice(i, Math.min(i + 5, lines.length)).join(" ");
      if (!context.includes("Timeout")) {
        // Check if context-based timeout is used nearby (Go pattern: context.WithTimeout)
        const surroundingContext = lines.slice(Math.max(0, i - 10), Math.min(i + 15, lines.length)).join(" ");
        if (/context\.With(Timeout|Deadline)/.test(surroundingContext)) continue;
        // Skip if Timeout is explicitly set to 0 (intentional — using context for cancellation)
        if (/Timeout:\s*0\b/.test(context)) continue;

        findings.push({
          detector: "missing-timeouts",
          severity: "HIGH",
          file: relPath,
          line: i + 1,
          message: "http.Client without Timeout — defaults to no timeout",
          fix: "Add Timeout: 30 * time.Second, or use context.WithTimeout for per-request timeouts",
          source: line.trim(),
        });
      }
    }

    // http.Get / http.Post (uses DefaultClient which has no timeout)
    if (/\bhttp\.(Get|Post|Head|PostForm)\s*\(/.test(line)) {
      findings.push({
        detector: "missing-timeouts",
        severity: "MEDIUM",
        file: relPath,
        line: i + 1,
        message: "Using http.DefaultClient (no timeout) — use a custom client with Timeout set",
        fix: "Create a custom http.Client{Timeout: 30 * time.Second} and use that instead",
        source: line.trim(),
      });
    }
  }

  return findings;
}

