import { readdirSync, readFileSync, statSync, lstatSync } from "fs";
import { join, relative } from "path";

const DEFAULT_MAX_FILE_SIZE = 1_048_576; // 1MB

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  "target",
  "vendor",
  ".cache",
  "coverage",
  ".turbo",
]);

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".php",
]);

export interface SourceFile {
  /** Absolute path */
  path: string;
  /** Relative to rootDir */
  relPath: string;
  /** File content (lazy-loaded) */
  content: string;
  /** Lines split from content */
  lines: string[];
  /** File extension (e.g. ".ts") */
  ext: string;
  /** Whether this file is a test/spec/e2e/example file */
  isTest: boolean;
  /** Whether this file appears to be server-side (Node/backend) vs browser/frontend */
  isServerSide: boolean;
}

/**
 * Check if a file path indicates a test, example, or non-production code.
 */
export function isTestFile(relPath: string): boolean {
  const normalized = "/" + relPath;
  return (
    relPath.includes(".test.") ||
    relPath.includes(".spec.") ||
    relPath.endsWith("_test.go") ||
    relPath.endsWith("_test.py") ||
    relPath.includes(".stories.") ||
    // Test directories
    normalized.includes("/__tests__/") ||
    normalized.includes("/__mocks__/") ||
    normalized.includes("/test/") ||
    normalized.includes("/tests/") ||
    normalized.includes("/e2e/") ||
    normalized.includes("/e2e-") ||
    normalized.includes("/playwright/") ||
    normalized.includes("/fixtures/") ||
    normalized.includes("/spec/") ||
    // Non-production directories
    normalized.includes("/migrations/") ||
    normalized.includes("/migration/") ||
    normalized.includes("/examples/") ||
    normalized.includes("/example/") ||
    normalized.includes("/demo/") ||
    normalized.includes("/sample/") ||
    normalized.includes("/samples/") ||
    normalized.includes("/testutil/") ||
    normalized.includes("/testing/") ||
    normalized.includes("/test-integ/") ||
    normalized.includes("/integration/") ||
    normalized.includes("/benchmark/") ||
    // Go testing convention: files named testing.go (not _test.go)
    relPath.endsWith("/testing.go")
  );
}

/**
 * Check if a file appears to be server-side (Node.js/backend) vs browser/frontend.
 * Server-side fetch calls are more dangerous (no browser timeout safety net).
 */
export function isServerSideFile(relPath: string): boolean {
  const normalized = "/" + relPath;

  // Check client-side FIRST — these take priority over ambiguous paths like /services/
  if (
    normalized.includes("/components/") ||
    normalized.includes("/pages/") ||
    normalized.includes("/views/") ||
    normalized.includes("/composables/") ||
    normalized.includes("/hooks/") ||
    normalized.includes("/web/") ||
    normalized.includes("/ui/") ||
    normalized.includes("/frontend/") ||
    normalized.includes("/public/") ||
    normalized.includes("/docs/") ||
    normalized.includes("/webui/") ||
    relPath.endsWith(".tsx") ||
    relPath.endsWith(".jsx") ||
    relPath.endsWith(".vue") ||
    relPath.endsWith(".svelte")
  ) {
    return false;
  }

  // Definitely server-side
  if (
    normalized.includes("/server/") ||
    normalized.includes("/api/") ||
    normalized.includes("/backend/") ||
    normalized.includes("/services/") ||
    normalized.includes("/workers/") ||
    normalized.includes("/cli/") ||
    normalized.includes("/cmd/") ||
    normalized.includes("/pkg/") ||
    normalized.includes("/internal/") ||
    normalized.includes("/agent/") ||
    relPath.endsWith(".go") ||
    relPath.endsWith(".py")
  ) {
    return true;
  }

  // Default: assume server-side (safer to flag)
  return true;
}

interface WalkOptions {
  maxFileSize?: number;
  exclude?: string[];
}

/**
 * Walk a directory tree and return all source files with their content.
 * Skips symlinks, hidden dirs, ignored dirs, and large files.
 */
export function walkSourceFiles(rootDir: string, options?: WalkOptions): SourceFile[] {
  const maxFileSize = options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const excludePatterns = options?.exclude ?? [];
  const files: SourceFile[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > 20) return;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith(".")) continue;

      const fullPath = join(dir, entry.name);
      const relPath = relative(rootDir, fullPath);

      // Skip excluded patterns
      if (excludePatterns.length > 0 && matchesExclude(relPath, excludePatterns)) {
        continue;
      }

      // Skip symlinks
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = entry.name.slice(entry.name.lastIndexOf("."));
        if (!SOURCE_EXTENSIONS.has(ext)) continue;

        // Skip large files
        try {
          const stat = statSync(fullPath);
          if (stat.size > maxFileSize) continue;
        } catch {
          continue;
        }

        let content: string;
        try {
          content = readFileSync(fullPath, "utf-8");
        } catch {
          continue;
        }

        files.push({
          path: fullPath,
          relPath,
          content,
          lines: content.split("\n"),
          ext,
          isTest: isTestFile(relPath),
          isServerSide: isServerSideFile(relPath),
        });
      }
    }
  }

  walk(rootDir, 0);
  return files;
}

function matchesExclude(relPath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.endsWith("/")) {
      if (relPath.startsWith(pattern) || relPath.includes("/" + pattern)) {
        return true;
      }
    } else {
      if (relPath === pattern || relPath.endsWith("/" + pattern)) {
        return true;
      }
    }
  }
  return false;
}
