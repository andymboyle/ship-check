import { resolve } from "path";
import type { ScanOptions, ScanResult, DetectorResult } from "./types";
import { walkSourceFiles } from "./walker";
import { detectSilentErrors } from "./detectors/silent-errors";
import { detectMissingTimeouts } from "./detectors/missing-timeouts";
import { detectUnboundedQueries } from "./detectors/unbounded-queries";
import { detectRawErrors } from "./detectors/raw-errors";
import { detectHardcodedSecrets } from "./detectors/hardcoded-secrets";
import { detectUnhandledAsync } from "./detectors/unhandled-async";
import type { SourceFile } from "./walker";

// Registry of all detectors
const DETECTORS: {
  id: string;
  name: string;
  description: string;
  run: (files: SourceFile[]) => DetectorResult;
}[] = [
  {
    id: "silent-errors",
    name: "Silent Error Swallowing",
    description: "Empty catch/except blocks, pass, returns without logging",
    run: detectSilentErrors,
  },
  {
    id: "missing-timeouts",
    name: "Missing Timeouts",
    description: "HTTP clients, SDK calls, DB connections without timeout",
    run: detectMissingTimeouts,
  },
  {
    id: "unbounded-queries",
    name: "Unbounded Queries",
    description: "Missing pagination, N+1 loops, column over-fetching",
    run: detectUnboundedQueries,
  },
  {
    id: "raw-errors",
    name: "Raw Error Leaks",
    description: "Technical error messages and stack traces shown to users",
    run: detectRawErrors,
  },
  {
    id: "hardcoded-secrets",
    name: "Hardcoded Secrets",
    description: "API keys, tokens, passwords, and secrets in source code",
    run: detectHardcodedSecrets,
  },
  {
    id: "unhandled-async",
    name: "Unhandled Async Errors",
    description: "Fire-and-forget promises, async handlers without error catching",
    run: detectUnhandledAsync,
  },
];

/**
 * List available detectors.
 */
export function listDetectors(): { id: string; name: string; description: string }[] {
  return DETECTORS.map((d) => ({ id: d.id, name: d.name, description: d.description }));
}

/**
 * Run detectors against a codebase.
 */
export function scan(options?: ScanOptions): ScanResult {
  const rootDir = resolve(options?.rootDir ?? process.cwd());
  const start = Date.now();

  // Walk the codebase once, share the files across all detectors
  const files = walkSourceFiles(rootDir, {
    maxFileSize: options?.maxFileSize,
    exclude: options?.exclude,
  });

  // Determine which detectors to run
  const detectorIds = options?.detectors;
  const detectorsToRun = detectorIds
    ? DETECTORS.filter((d) => detectorIds.includes(d.id))
    : DETECTORS;

  // Run each detector
  const results: DetectorResult[] = [];
  for (const detector of detectorsToRun) {
    results.push(detector.run(files));
  }

  return {
    results,
    filesScanned: files.length,
    duration: Date.now() - start,
  };
}
