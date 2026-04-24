export type Severity = "HIGH" | "MEDIUM" | "LOW";

export interface Finding {
  detector: string;
  severity: Severity;
  file: string;
  line: number;
  message: string;
  fix: string;
  /** The source line that triggered the finding */
  source?: string;
}

export interface DetectorResult {
  detector: string;
  name?: string;
  description: string;
  findings: Finding[];
}

export interface Detector {
  id: string;
  name: string;
  description: string;
  languages: string[];
  run(rootDir: string): DetectorResult;
}

export interface ScanOptions {
  rootDir?: string;
  /** Which detectors to run (by id). Default: all */
  detectors?: string[];
  /** File/directory patterns to exclude */
  exclude?: string[];
  /** Max file size in bytes (default: 1MB) */
  maxFileSize?: number;
}

export interface ScanResult {
  results: DetectorResult[];
  filesScanned: number;
  duration: number;
}
