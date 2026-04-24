import { isJsFile } from "../constants";
import type { DetectorResult, Finding } from "../types";
import type { SourceFile } from "../walker";

/**
 * Detect usage of deprecated APIs and patterns.
 * These are documented deprecations — the replacement exists and is well-known.
 */
export function detectDeprecatedApis(files: SourceFile[]): DetectorResult {
  const findings: Finding[] = [];

  for (const file of files) {
    if (file.isTest) continue;

    if (isJsFile(file.ext)) {
      findings.push(...detectJsDeprecated(file));
    } else if (file.ext === ".py") {
      findings.push(...detectPythonDeprecated(file));
    }
  }

  return {
    detector: "deprecated-apis",
    name: "Deprecated API Usage",
    description: "Usage of deprecated APIs that have well-known replacements",
    findings,
  };
}

const JS_DEPRECATED: {
  pattern: RegExp;
  name: string;
  replacement: string;
}[] = [
  // String methods
  {
    pattern: /\.substr\s*\(/,
    name: "String.substr()",
    replacement: "Use .substring() or .slice() instead",
  },
  // React lifecycle
  {
    pattern: /\bcomponentWillMount\b/,
    name: "componentWillMount",
    replacement: "Use componentDidMount or useEffect hook instead",
  },
  {
    pattern: /\bcomponentWillReceiveProps\b/,
    name: "componentWillReceiveProps",
    replacement: "Use static getDerivedStateFromProps or componentDidUpdate instead",
  },
  {
    pattern: /\bcomponentWillUpdate\b/,
    name: "componentWillUpdate",
    replacement: "Use getSnapshotBeforeUpdate or componentDidUpdate instead",
  },
  // Node.js
  {
    pattern: /\bfs\.exists\s*\(/,
    name: "fs.exists()",
    replacement: "Use fs.access() or fs.stat() instead",
  },
  {
    pattern: /\bnew Buffer\s*\(/,
    name: "new Buffer()",
    replacement: "Use Buffer.from(), Buffer.alloc(), or Buffer.allocUnsafe() instead",
  },
  {
    pattern: /\burl\.parse\s*\(/,
    name: "url.parse()",
    replacement: "Use new URL() instead",
  },
  // DOM
  {
    pattern: /\bdocument\.write\s*\(/,
    name: "document.write()",
    replacement: "Use DOM manipulation (createElement, innerHTML) instead",
  },
];

function detectJsDeprecated(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  // Skip .d.ts files
  if (relPath.endsWith(".d.ts")) return findings;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    for (const dep of JS_DEPRECATED) {
      if (!dep.pattern.test(trimmed)) continue;

      findings.push({
        detector: "deprecated-apis",
        severity: "LOW",
        file: relPath,
        line: i + 1,
        message: `${dep.name} is deprecated`,
        fix: dep.replacement,
        source: trimmed.length > 80 ? trimmed.slice(0, 77) + "..." : trimmed,
      });

      break; // one finding per line
    }
  }

  return findings;
}

const PYTHON_DEPRECATED: {
  pattern: RegExp;
  name: string;
  replacement: string;
}[] = [
  {
    pattern: /\btyping\.Optional\b/,
    name: "typing.Optional",
    replacement: "Use X | None instead (Python 3.10+)",
  },
  {
    pattern: /\btyping\.Union\b/,
    name: "typing.Union",
    replacement: "Use X | Y instead (Python 3.10+)",
  },
  {
    pattern: /\btyping\.List\b/,
    name: "typing.List",
    replacement: "Use list[X] instead (Python 3.9+)",
  },
  {
    pattern: /\btyping\.Dict\b/,
    name: "typing.Dict",
    replacement: "Use dict[X, Y] instead (Python 3.9+)",
  },
  {
    pattern: /\btyping\.Tuple\b/,
    name: "typing.Tuple",
    replacement: "Use tuple[X, ...] instead (Python 3.9+)",
  },
  {
    pattern: /\btyping\.Set\b/,
    name: "typing.Set",
    replacement: "Use set[X] instead (Python 3.9+)",
  },
  {
    pattern: /\bdatetime\.datetime\.utcnow\s*\(\)/,
    name: "datetime.utcnow()",
    replacement: "Use datetime.now(timezone.utc) instead (utcnow returns naive datetime)",
  },
  {
    pattern: /\bdatetime\.datetime\.utcfromtimestamp\s*\(/,
    name: "datetime.utcfromtimestamp()",
    replacement: "Use datetime.fromtimestamp(ts, timezone.utc) instead",
  },
];

function detectPythonDeprecated(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const { lines, relPath } = file;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("#")) continue;

    for (const dep of PYTHON_DEPRECATED) {
      if (!dep.pattern.test(trimmed)) continue;

      findings.push({
        detector: "deprecated-apis",
        severity: "LOW",
        file: relPath,
        line: i + 1,
        message: `${dep.name} is deprecated`,
        fix: dep.replacement,
        source: trimmed.length > 80 ? trimmed.slice(0, 77) + "..." : trimmed,
      });

      break;
    }
  }

  return findings;
}
