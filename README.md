# ship-check

[![license](https://img.shields.io/github/license/andymboyle/ship-check)](LICENSE)
![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

```
     _     _                  _               _    
 ___| |__ (_)_ __         ___| |__   ___  ___| | __
/ __| '_ \| | '_ \ ___  / __| '_ \ / _ \/ __| |/ /
\__ \ | | | | |_) |_____| (__| | | |  __/ (__|   < 
|___/_| |_|_| .__/       \___|_| |_|\___|\___|_|\_\
             |_|                                    
```

Find the reliability problems your linter doesn't catch. Silent error swallowing, missing timeouts, N+1 queries, raw error leaks—the stuff that causes production incidents, not syntax warnings.

Zero dependencies. Scans 3,000+ files in under a second.

```bash
npx ship-check
```

---

## Why This Exists

Linters check syntax and style. They don't check:

- Is this catch block actually doing anything, or is it hiding failures?
- Does this HTTP call have a timeout, or will it hang forever when a downstream service goes down?
- Is this database query inside a loop, firing 50 separate queries when it could be one?
- Are we showing raw Python tracebacks to users in the UI?

These are the bugs that cause production incidents—not syntax errors, but *operational* problems. They're invisible until something goes wrong.

I ran structured audits against our production monorepo and found 128 silent error-swallowing catch blocks, 88 HTTP calls with no timeout, 6 queries loading 30+ columns when only 1-2 were needed, and 67 components showing raw tracebacks to users. Each finding led to a real fix. Some were one-line changes. Some were "how did we ship this."

So I automated the detection.

---

## What It Finds

| Detector | What It Catches | Languages |
|----------|----------------|-----------|
| **silent-errors** | Empty catch/except blocks, `pass`, returns without logging, overly broad exception types | Python, JS/TS, Go |
| **missing-timeouts** | `fetch()`, `httpx`, `requests`, `axios`, Redis, SQLAlchemy without timeout config | Python, JS/TS, Go |
| **unbounded-queries** | `findMany()` without pagination, N+1 queries in loops, SELECT * over-fetching | JS/TS, Python |
| **raw-errors** | `{error.message}` in JSX, `traceback.format_exc()` in responses, stack traces in UI | JS/TS, Python |
| **hardcoded-secrets** | AWS keys, Slack/GitHub/Stripe tokens, passwords in connection strings, JWT tokens | All |
| **unhandled-async** | `Promise.all` without await/catch, async event handlers without try/catch, fire-and-forget `create_task()` | JS/TS, Python |

Each finding includes severity (HIGH/MEDIUM/LOW), exact file:line, a description of the problem, and a concrete fix.

---

## Install

```bash
# Run without installing
npx ship-check

# Install globally
npm install -g ship-check

# Add to your project
npm install --save-dev ship-check
```

---

## Usage

```bash
ship-check                              # Run all detectors (summary)
ship-check --verbose                    # Full details for every finding
ship-check silent-errors                # Run one detector
ship-check --severity=HIGH              # Only show HIGH severity
ship-check src/api/                     # Scan a specific directory
ship-check --md > report.md             # Markdown report
ship-check --json                       # JSON output
ship-check --ci                         # Exit code 1 if HIGH findings exist
```

| Flag | What it does |
|------|-------------|
| `--verbose`, `-v` | Full details for every finding |
| `--json` | JSON output |
| `--markdown`, `--md` | Markdown report |
| `--severity=HIGH` | Only show HIGH (or HIGH+MEDIUM) |
| `--only=<detector>` | Run specific detectors (repeatable) |
| `--exclude=<pattern>` | Skip files/directories (repeatable) |
| `--ci` | Exit code 1 if HIGH findings exist |
| `--list` | List available detectors |

### CI / GitHub Action

```yaml
- name: Ship check
  run: npx ship-check --ci --severity=HIGH
```

### Programmatic API

```typescript
import { scan, formatJSON } from 'ship-check';

const result = scan({
  rootDir: './src',
  detectors: ['silent-errors', 'missing-timeouts'],
  exclude: ['generated/'],
});

// result.results     — array of DetectorResult (one per detector)
// result.filesScanned — number of files scanned
// result.duration     — scan time in ms

console.log(formatJSON(result));
```

---

## How It Works

ship-check walks your source tree once, reads every file into memory, then passes the file list to each detector. Each detector scans for patterns using regex + structural context—not just "does this line contain X" but "is this database call inside a loop?" and "is this error.message inside JSX or a logger?"

**What makes this different from a linter:**

- **Structural context**: Tracks loop depth to find N+1 queries (query inside a `.map()` or `for` loop)
- **Call-site context**: Checks if a timeout param exists within the multi-line function call, not just anywhere nearby
- **Semantic context**: Distinguishes `{error.message}` in JSX (user-facing) from `console.error(error.message)` (fine)
- **Absence detection**: Finds what's *missing*—no timeout, no logging, no pagination—not just what's wrong

---

## Does It Actually Work?

I ran ship-check against 8 popular open-source projects. **Every one had HIGH-severity findings.**

| Project | Stack | Files | HIGH | MEDIUM | LOW | Time |
|---------|-------|-------|------|--------|-----|------|
| [cal.com](https://github.com/calcom/cal.com) | TS/Next.js | 5,074 | 247 | 103 | 414 | 871ms |
| [twenty](https://github.com/twentyhq/twenty) | TS/React | 16,665 | 124 | 227 | 1 | 2.5s |
| [nocodb](https://github.com/nocodb/nocodb) | TS/Node | 1,844 | 221 | 229 | 0 | 617ms |
| [documenso](https://github.com/documenso/documenso) | TS/Next.js | 1,825 | 53 | 27 | 103 | 343ms |
| [hoppscotch](https://github.com/hoppscotch/hoppscotch) | TS/Vue | 1,183 | 50 | 32 | 85 | 259ms |
| [medusa](https://github.com/medusajs/medusa) | TS/Node | 10,638 | 80 | 121 | 0 | 1.7s |
| [immich](https://github.com/immich-app/immich) | TS/Svelte | 999 | 48 | 55 | 0 | 243ms |
| [maybe](https://github.com/maybe-finance/maybe) | TS/Next.js | 844 | 9 | 1 | 0 | 82ms |

Test files are automatically excluded—these are all production code findings.

### What the detectors found

**cal.com**—193 `fetch()` calls with no timeout across API integrations (Vercel, app stores, OAuth). 15 empty catch blocks in critical paths.

**nocodb**—134 empty catch blocks in the Vue frontend (`catch (e) {}`), silently swallowing errors in clipboard, attachment, and table operations. 45 HTTP clients with no timeout.

**twenty**—95 missing timeouts across their CRM service calls. 10 HIGH silent-error blocks including broad `except Exception` handlers.

### Real fixes from a production monorepo

These detectors started as LLM-driven audit prompts. Here's what they found and what was fixed:

| What was found | What was fixed |
|---------------|---------------|
| 88 `fetch()` calls with no timeout | Added `AbortSignal.timeout(30_000)` to all service calls |
| 29 HIGH silent error-swallowing blocks | Added `logger.exception()`, narrowed exception types |
| 6 Prisma queries loading 30+ columns | Added `select` to fetch only needed fields |
| 67 components showing raw `error.message` | Created `getUserFriendlyErrorMessage()` utility |

---

## Adding Detectors

Each detector is a function that receives files and returns findings:

```typescript
import type { DetectorResult, Finding } from "../types";
import type { SourceFile } from "../walker";

export function detectMyPattern(files: SourceFile[]): DetectorResult {
  const findings: Finding[] = [];

  for (const file of files) {
    for (let i = 0; i < file.lines.length; i++) {
      // Check for your pattern
      if (/* matches */) {
        findings.push({
          detector: "my-pattern",
          severity: "HIGH",
          file: file.relPath,
          line: i + 1,
          message: "Description of the problem",
          fix: "How to fix it",
          source: file.lines[i].trim(),
        });
      }
    }
  }

  return {
    detector: "my-pattern",
    name: "My Pattern",
    description: "What this detector finds",
    findings,
  };
}
```

Register it in `scanner.ts` and it works with all CLI flags, output formats, and filtering automatically.

---

## Contributing

Found a false positive? A pattern ship-check should detect? [Open an issue](https://github.com/andymboyle/ship-check/issues).

---

## License

MIT
