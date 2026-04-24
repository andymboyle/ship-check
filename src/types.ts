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
  /** Whether this finding can be auto-fixed with --fix */
  fixable?: boolean;
  /** Internal: the pattern that matched, used by the fixer */
  _fixId?: string;
}

export interface FixResult {
  file: string;
  line: number;
  before: string;
  after: string;
}

export interface DetectorResult {
  detector: string;
  name?: string;
  description: string;
  findings: Finding[];
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
