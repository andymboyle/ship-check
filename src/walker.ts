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
