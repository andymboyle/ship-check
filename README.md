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

Zero dependencies. 9 detectors. Scans Python, TypeScript, JavaScript, and Go. 16,000 files in under 3 seconds.

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

### Tested against 20 open-source projects

Every project had HIGH-severity findings. 102,000+ files scanned.

| Project | Files | HIGH | MEDIUM | LOW | Time |
|---------|-------|------|--------|-----|------|
| [saleor](https://github.com/saleor/saleor) | 4,237 | 349 | 484 | 0 | 663ms |
| [chatwoot](https://github.com/chatwoot/chatwoot) | 2,994 | 244 | 83 | 6 | 385ms |
| [lobe-chat](https://github.com/lobehub/lobe-chat) | 7,747 | 211 | 930 | 987 | 1.7s |
| [cal.com](https://github.com/calcom/cal.com) | 5,074 | 155 | 830 | 715 | 1.1s |
| [supabase](https://github.com/supabase/supabase) | 6,550 | 148 | 1,028 | 496 | 1.6s |
| [n8n](https://github.com/n8n-io/n8n) | 12,122 | 137 | 1,597 | 549 | 3.0s |
| [paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) | 708 | 123 | 160 | 1 | 197ms |
| [refine](https://github.com/refinedev/refine) | 6,766 | 123 | 649 | 212 | 1.3s |
| [twenty](https://github.com/twentyhq/twenty) | 16,665 | 95 | 838 | 488 | 3.3s |
| [outline](https://github.com/outline/outline) | 2,196 | 65 | 224 | 67 | 480ms |
| [nocodb](https://github.com/nocodb/nocodb) | 1,844 | 47 | 1,155 | 413 | 837ms |
| [strapi](https://github.com/strapi/strapi) | 4,341 | 45 | 320 | 386 | 796ms |
| [medusa](https://github.com/medusajs/medusa) | 10,638 | 39 | 1,002 | 590 | 2.2s |
| [documenso](https://github.com/documenso/documenso) | 1,825 | 32 | 117 | 164 | 463ms |
| [hoppscotch](https://github.com/hoppscotch/hoppscotch) | 1,183 | 31 | 200 | 272 | 339ms |
| [loki](https://github.com/grafana/loki) | 2,531 | 20 | 41 | 7 | 553ms |
| [trpc](https://github.com/trpc/trpc) | 902 | 18 | 63 | 128 | 175ms |
| [immich](https://github.com/immich-app/immich) | 999 | 12 | 90 | 85 | 288ms |
| [appwrite](https://github.com/appwrite/appwrite) | 1,476 | 11 | 9 | 12 | 274ms |
| [maybe](https://github.com/maybe-finance/maybe) | 844 | 5 | 2 | 0 | 90ms |

Test files, migration files, and spec directories are automatically excluded.

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
