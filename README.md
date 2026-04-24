# ship-check

<!-- [![npm](https://img.shields.io/npm/v/ship-check)](https://www.npmjs.com/package/ship-check) -->
[![license](https://img.shields.io/github/license/andymboyle/ship-check)](LICENSE)
![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
<!-- [![downloads](https://img.shields.io/npm/dm/ship-check)](https://www.npmjs.com/package/ship-check) -->

```
     _     _                  _               _    
 ___| |__ (_)_ __         ___| |__   ___  ___| | __
/ __| '_ \| | '_ \ ___  / __| '_ \ / _ \/ __| |/ /
\__ \ | | | | |_) |_____| (__| | | |  __/ (__|   < 
|___/_| |_|_| .__/       \___|_| |_|\___|\___|_|\_\
             |_|                                    
```

Find the reliability problems your linter doesn't catch. Missing timeouts, silent error swallowing, N+1 queries, raw error leaks, hardcoded secrets—the stuff that causes production incidents, not syntax warnings.

Zero dependencies. 9 detectors. 3 languages. Scans 16,000 files in under 3 seconds.

```bash
npx ship-check
```

---

## Why This Exists

Linters check syntax and style. They don't check whether your `fetch()` call will hang forever when a downstream service goes down, whether your `catch {}` block is hiding a production outage, or whether you're showing raw Python tracebacks to users.

I ran structured audits against our production monorepo and found 88 HTTP calls with no timeout, 128 silent error-swallowing catch blocks, 6 queries loading 30+ columns when only 1-2 were needed, and 67 components showing raw error messages to users. Each finding led to a real fix.

So I automated the detection. Every detector has been validated against 8 open-source projects and precision-tested against manually classified fixtures.

---

## What It Finds

| Detector | What It Catches | Severity | Languages |
|----------|----------------|----------|-----------|
| **missing-timeouts** | `fetch()`, `httpx`, `requests`, `axios`, Redis without timeout | HIGH | Python, JS/TS, Go |
| **silent-errors** | Empty catch/except blocks, `pass`, returns without logging | HIGH/MEDIUM | Python, JS/TS, Go |
| **unbounded-queries** | N+1 queries in loops, `findMany()` without pagination | HIGH/LOW | JS/TS, Python |
| **raw-errors** | `{error.message}` in JSX, tracebacks in API responses | HIGH | JS/TS, Python |
| **hardcoded-secrets** | AWS keys, Slack/GitHub/Stripe tokens, passwords, JWTs | HIGH | All |
| **unhandled-async** | Fire-and-forget `Promise.all`, async handlers without try/catch | HIGH | JS/TS, Python |
| **console-log** | `console.log` left in production code | LOW | JS/TS |
| **async-without-await** | `async` functions that never use `await` | MEDIUM | JS/TS |
| **deprecated-apis** | `substr()`, `componentWillMount`, `typing.Optional`, `utcnow()` | LOW | JS/TS, Python |

---

## Does It Actually Work?

### Tested against 8 open-source projects

| Project | Stack | Files | HIGH | MEDIUM | LOW | Time |
|---------|-------|-------|------|--------|-----|------|
| [cal.com](https://github.com/calcom/cal.com) | TS/Next.js | 5,074 | 155 | 830 | 715 | 1.1s |
| [twenty](https://github.com/twentyhq/twenty) | TS/React | 16,665 | 95 | 840 | 493 | 3.3s |
| [nocodb](https://github.com/nocodb/nocodb) | TS/Node | 1,844 | 47 | 1,168 | 485 | 869ms |
| [medusa](https://github.com/medusajs/medusa) | TS/Node | 10,638 | 39 | 1,294 | 592 | 2.2s |
| [hoppscotch](https://github.com/hoppscotch/hoppscotch) | TS/Vue | 1,183 | 31 | 200 | 272 | 359ms |
| [documenso](https://github.com/documenso/documenso) | TS/Next.js | 1,825 | 32 | 117 | 164 | 486ms |
| [immich](https://github.com/immich-app/immich) | TS/Svelte | 999 | 12 | 91 | 85 | 316ms |
| [maybe](https://github.com/maybe-finance/maybe) | TS/Next.js | 844 | 5 | 2 | 0 | 109ms |

### Precision-validated

We manually classified 44 HIGH findings from cal.com by reading the actual source code. Each was marked true-positive (real problem), false-positive (intentional/safe), or debatable.

The missing-timeouts detector—which produces the most findings—has **90% precision**: 9 out of 10 sampled findings were real `fetch()` calls to external APIs with no timeout.

A precision test suite with curated true-positive and false-positive fixtures runs on every change. Current score: **100%** on fixtures (12 true positives detected, 0 false positives flagged).

### What it found in the wild

**cal.com**—148 `fetch()` calls with no timeout across OAuth token exchanges (Microsoft, Feishu, Zoom), app store integrations, and webhook handlers. Two fire-and-forget `Promise.all()` calls that silently lose notification emails.

**hoppscotch**—A hardcoded PostHog API key in production source code. 31 missing timeouts across agent communication and auth services.

**twenty**—90 missing timeouts. A raw `error.message` rendered directly in a component renderer UI.

### Real fixes from a production monorepo

| What was found | What was fixed |
|---------------|---------------|
| 88 `fetch()` calls with no timeout | Added `AbortSignal.timeout(30_000)` to all service calls |
| 29 HIGH silent error-swallowing blocks | Added `logger.exception()`, narrowed exception types |
| 6 Prisma queries loading 30+ columns | Added `select` to fetch only needed fields |
| 67 components showing raw `error.message` | Created `getUserFriendlyErrorMessage()` utility |

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
ship-check --fix                        # Auto-fix what's safe to fix
ship-check missing-timeouts --fix       # Fix only timeouts
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
| `--fix` | Auto-fix findings where safe (currently: missing timeouts) |
| `--ci` | Exit code 1 if HIGH findings exist |
| `--list` | List available detectors |

### Auto-fix

`--fix` applies safe, one-line fixes and shows you exactly what changed:

```
$ ship-check missing-timeouts --fix

🔧 Applying 4 auto-fixes...

  ✅ src/api.ts:1
     - const res = await fetch("https://api.example.com/data");
     + const res = await fetch("https://api.example.com/data", { signal: AbortSignal.timeout(30_000) });

  ✅ src/client.py:4
     - client = httpx.AsyncClient()
     + client = httpx.AsyncClient(timeout=30.0)

4 file(s) fixed.
```

Currently auto-fixable: `fetch()`, `httpx`, `requests`, `aiohttp`, `redis.Redis`, `axios.create`, `new Redis`. Multi-line calls are skipped safely.

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

console.log(formatJSON(result));
```

---

## How It Works

ship-check walks your source tree once, reads every file into memory, then passes the file list to each detector. Each detector uses regex + structural context—not just "does this line match" but "is this query inside a loop?" and "is this error.message inside JSX or a logger?"

**What makes this different from a linter:**

- **Structural context**: Tracks loop depth to find N+1 queries (real `for`/`forEach` loops, not `.map()` which runs in parallel)
- **Call-site context**: Checks if a timeout param exists within the function call, not just anywhere nearby
- **Semantic context**: Skips `console.error(error.message)` (fine) but flags `{error.message}` in JSX (user-facing)
- **Absence detection**: Finds what's *missing*—no timeout, no logging, no pagination—not just what's wrong
- **Safe patterns**: Recognizes localStorage try/catch, JSON.parse fallbacks, cleanup code, i18n-wrapped errors

Test files, type definitions (.d.ts), string literals mentioning function names, and template variable references are automatically excluded.

---

## Contributing

Found a false positive? A pattern ship-check should detect? [Open an issue](https://github.com/andymboyle/ship-check/issues).

Want to add a detector? Each one is a single function. See `src/detectors/` for examples, then register it in `scanner.ts`.

---

## License

MIT
