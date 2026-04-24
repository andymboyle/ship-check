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

    // Skip comment lines, imports, type definitions, and string mentions
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("import ")) continue;
    if (trimmed.startsWith("declare ") || trimmed.startsWith("function ") && relPath.endsWith(".d.ts")) continue;
    if (trimmed.startsWith("return \"") || trimmed.startsWith("return '") || trimmed.startsWith("return `")) continue;

    for (const p of JS_PATTERNS) {
      if (!p.pattern.test(line)) continue;

      // Check the call site for timeout configuration (this line + next 5 for multi-line calls)
      const contextEnd = Math.min(lines.length, i + 6);
      const context = lines.slice(i, contextEnd).join(" ");

      if (p.timeoutIndicators.some((t) => context.includes(t))) continue;

      // For fetch: skip tRPC client calls, same-origin/internal calls, and asset fetches
      if (p.service === "fetch") {
        // tRPC .fetch() calls (e.g., utils.viewer.bookings.find.fetch)
        if (/\w+\.\w+\.fetch\s*\(/.test(trimmed) && !/\bfetch\s*\(["'`]/.test(trimmed)) continue;
        // Fetching local/internal URLs (own webapp, /api/, /fonts/)
        if (/fetch\s*\(\s*["'`]\/(api|fonts|static|assets)/.test(trimmed)) continue;
        if (/fetch\s*\(\s*["'`]\.\//.test(trimmed)) continue;
        // Font/image loading patterns
        if (/\.(ttf|woff|woff2|otf|png|jpg|svg)\b/.test(trimmed)) continue;
        // tRPC createClient setup (no actual network call)
        if (/createClient\s*\(/.test(trimmed)) continue;
        // fetch() mentioned inside a string literal (not an actual call)
        if (/["'`].*fetch\s*\(.*["'`]/.test(trimmed)) continue;
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
        findings.push({
          detector: "missing-timeouts",
          severity: "HIGH",
          file: relPath,
          line: i + 1,
          message: "http.Client without Timeout — defaults to no timeout",
          fix: "Add Timeout: 30 * time.Second",
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

