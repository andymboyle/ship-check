import type { DetectorResult, Finding } from "../types";
import type { SourceFile } from "../walker";

/**
 * Detect hardcoded secrets, API keys, tokens, and passwords in source code.
 * These should be in environment variables or secret managers, not committed to git.
 */
export function detectHardcodedSecrets(files: SourceFile[]): DetectorResult {
  const findings: Finding[] = [];

  for (const file of files) {
    if (file.isTest) continue;
    findings.push(...detectSecretPatterns(file));
  }

  return {
    detector: "hardcoded-secrets",
    name: "Hardcoded Secrets",
    description: "API keys, tokens, passwords, and secrets committed in source code",
    findings,
  };
}

// Patterns that indicate a hardcoded secret value.
// Each has a regex to match the assignment and a label for the finding.
const SECRET_PATTERNS: {
  pattern: RegExp;
  label: string;
  severity: "HIGH" | "MEDIUM";
}[] = [
  // AWS access keys (AKIA...)
  {
    pattern: /['"`](AKIA[0-9A-Z]{16})['"`]/,
    label: "AWS access key",
    severity: "HIGH",
  },
  // Generic API key assignments: api_key = "sk-..."
  {
    pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"`]([a-zA-Z0-9_\-]{20,})['"`]/i,
    label: "API key",
    severity: "HIGH",
  },
  // Bearer tokens
  {
    pattern: /['"`](Bearer\s+[a-zA-Z0-9_\-\.]{20,})['"`]/,
    label: "Bearer token",
    severity: "HIGH",
  },
  // Private keys
  {
    pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,
    label: "Private key",
    severity: "HIGH",
  },
  // Password assignments: password = "actual-value"
  {
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"`]([^'"`\s]{8,})['"`]/i,
    label: "Hardcoded password",
    severity: "HIGH",
  },
  // Slack tokens (xoxb-, xoxp-, xoxs-)
  {
    pattern: /['"`](xox[bpsa]-[0-9a-zA-Z\-]{10,})['"`]/,
    label: "Slack token",
    severity: "HIGH",
  },
  // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
  {
    pattern: /['"`](gh[pousr]_[a-zA-Z0-9]{36,})['"`]/,
    label: "GitHub token",
    severity: "HIGH",
  },
  // Stripe keys (sk_live_, sk_test_, pk_live_, pk_test_)
  {
    pattern: /['"`]([sr]k_(?:live|test)_[a-zA-Z0-9]{20,})['"`]/,
    label: "Stripe key",
    severity: "HIGH",
  },
  // JWT tokens (eyJ...)
  {
    pattern: /['"`](eyJ[a-zA-Z0-9_\-]{20,}\.eyJ[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,})['"`]/,
    label: "JWT token",
    severity: "HIGH",
  },
  // Generic secret/token assignments with long values
  {
    pattern: /(?:secret|token|auth[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*['"`]([a-zA-Z0-9_\-\/\+]{32,})['"`]/i,
    label: "Secret/token value",
    severity: "MEDIUM",
  },
  // Database connection strings with passwords
  {
    pattern: /['"`](?:postgres|mysql|mongodb(?:\+srv)?):\/\/[^:]+:([^@\s'"`]{4,})@/,
    label: "Database password in connection string",
    severity: "HIGH",
  },
];

// Files/patterns that are expected to have secret-like strings (not actual secrets)
const IGNORE_CONTEXTS = [
  /process\.env\./,           // Reading from env var
  /os\.environ/,              // Python env var
  /os\.Getenv/,               // Go env var
  /ENV\[/,                    // Ruby env var
  /\$_ENV/,                   // PHP env var
  /getenv\(/,                 // PHP env var
  /config\.\w+/,              // Config object access
  /placeholder|example|dummy|fake|test|sample|mock|changeme|your[_-]/i,
  /TODO|FIXME|REPLACE/i,
];

function detectSecretPatterns(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  // Skip known non-secret files
  if (
    relPath.endsWith(".lock") ||
    relPath.endsWith(".sum") ||
    relPath.includes("package.json") ||
    relPath.includes("tsconfig") ||
    relPath.endsWith(".d.ts") ||
    relPath.includes("migration") ||
    relPath.includes("seed")
  ) {
    return findings;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*")) continue;

    for (const sp of SECRET_PATTERNS) {
      if (!sp.pattern.test(line)) continue;

      // Check if this line is in a context where secret-like strings are expected
      if (IGNORE_CONTEXTS.some((ctx) => ctx.test(line))) continue;

      // Check surrounding context for env var loading
      const context = lines.slice(Math.max(0, i - 2), Math.min(i + 2, lines.length)).join("\n");
      if (IGNORE_CONTEXTS.some((ctx) => ctx.test(context))) continue;

      findings.push({
        detector: "hardcoded-secrets",
        severity: sp.severity,
        file: relPath,
        line: i + 1,
        message: `${sp.label} appears to be hardcoded in source code`,
        fix: "Move to an environment variable or secret manager",
        source: trimmed.length > 80 ? trimmed.slice(0, 77) + "..." : trimmed,
      });

      // Only report one secret per line
      break;
    }
  }

  return findings;
}

export const hardcodedSecretsDetector = {
  id: "hardcoded-secrets",
  name: "Hardcoded Secrets",
  description: "API keys, tokens, passwords, and secrets committed in source code",
  languages: ["all"],
};
