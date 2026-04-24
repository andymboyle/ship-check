import { describe, expect, test } from "vitest";
import { join } from "path";
import { scan } from "../src/scanner";

const FIXTURES = join(__dirname, "fixtures");

describe("silent-errors detector", () => {
  const result = scan({
    rootDir: join(FIXTURES, "silent-errors"),
    detectors: ["silent-errors"],
  });
  const findings = result.results[0].findings;

  test("finds empty except block (bare except: pass)", () => {
    const passFindings = findings.filter((f) =>
      f.message.includes("pass"),
    );
    expect(passFindings.length).toBeGreaterThan(0);
  });

  test("finds except returning without logging", () => {
    const returnFindings = findings.filter((f) =>
      f.message.includes("returns silently") || f.message.includes("without re-raise"),
    );
    expect(returnFindings.length).toBeGreaterThan(0);
  });

  test("finds empty JS catch block", () => {
    const emptyFindings = findings.filter((f) =>
      f.message.includes("Empty catch block") && f.file.endsWith(".ts"),
    );
    expect(emptyFindings.length).toBeGreaterThan(0);
  });

  test("finds catch with only console.log", () => {
    const logFindings = findings.filter((f) =>
      f.message.includes("console.log"),
    );
    expect(logFindings.length).toBeGreaterThan(0);
  });

  test("does NOT flag catch blocks with proper error handling", () => {
    // The "properHandling" function has console.error + throw
    const properFile = findings.filter((f) =>
      f.source?.includes("console.error"),
    );
    expect(properFile.length).toBe(0);
  });

  test("does NOT flag narrowly-typed Python exceptions with logging", () => {
    // safe_divide catches ZeroDivisionError with logger.warning
    const divideFindings = findings.filter((f) =>
      f.message.includes("ZeroDivisionError"),
    );
    expect(divideFindings.length).toBe(0);
  });

  test("HIGH severity for bare except: pass", () => {
    const passFindings = findings.filter((f) =>
      f.message.includes("pass"),
    );
    for (const f of passFindings) {
      expect(f.severity).toBe("HIGH");
    }
  });
});

describe("missing-timeouts detector", () => {
  const result = scan({
    rootDir: join(FIXTURES, "timeouts"),
    detectors: ["missing-timeouts"],
  });
  const findings = result.results[0].findings;

  test("finds httpx.AsyncClient without timeout", () => {
    const httpx = findings.filter((f) => f.message.includes("httpx"));
    expect(httpx.length).toBe(1); // only the one without timeout
  });

  test("finds requests.get without timeout", () => {
    const reqs = findings.filter((f) => f.message.includes("requests"));
    expect(reqs.length).toBe(1);
  });

  test("finds fetch without timeout", () => {
    const fetches = findings.filter((f) =>
      f.message.includes("fetch") && f.file.endsWith(".ts"),
    );
    expect(fetches.length).toBe(1); // only the bare fetch, not the one with AbortSignal
  });

  test("finds axios.create without timeout", () => {
    const axios = findings.filter((f) => f.message.includes("axios"));
    expect(axios.length).toBe(1);
  });

  test("does NOT flag httpx with timeout=30.0", () => {
    // safe_client has timeout — should not be in findings
    const safeFindings = findings.filter((f) =>
      f.source?.includes("timeout=30"),
    );
    expect(safeFindings.length).toBe(0);
  });

  test("does NOT flag fetch with AbortSignal", () => {
    const safeFindings = findings.filter((f) =>
      f.source?.includes("AbortSignal"),
    );
    expect(safeFindings.length).toBe(0);
  });
});

describe("unbounded-queries detector", () => {
  const result = scan({
    rootDir: join(FIXTURES, "queries"),
    detectors: ["unbounded-queries"],
  });
  const findings = result.results[0].findings;

  test("finds findMany without pagination", () => {
    const unbounded = findings.filter((f) =>
      f.message.includes("findMany() without take/skip"),
    );
    expect(unbounded.length).toBeGreaterThan(0);
  });

  test("finds N+1 query in loop", () => {
    const n1 = findings.filter((f) =>
      f.message.includes("N+1") || f.message.includes("inside a loop"),
    );
    expect(n1.length).toBeGreaterThan(0);
  });

  test("finds findMany without select", () => {
    const noSelect = findings.filter((f) =>
      f.message.includes("without select"),
    );
    expect(noSelect.length).toBeGreaterThan(0);
  });

  test("does NOT flag findMany with take as unbounded", () => {
    // The paged query has take: 20 — should not trigger "without take/skip"
    const unbounded = findings.filter(
      (f) => f.message.includes("without take/skip"),
    );
    // Only the first findMany (line 2) should be flagged, not the paged one (line 5)
    for (const f of unbounded) {
      expect(f.line).not.toBe(5);
    }
  });

  test("does NOT flag findMany with select", () => {
    const selectFindings = findings.filter((f) =>
      f.source?.includes("select: { id: true }"),
    );
    expect(selectFindings.length).toBe(0);
  });

  test("N+1 findings are HIGH severity", () => {
    const n1 = findings.filter((f) => f.message.includes("loop"));
    for (const f of n1) {
      expect(f.severity).toBe("HIGH");
    }
  });
});

describe("raw-errors detector", () => {
  const result = scan({
    rootDir: join(FIXTURES, "raw-errors"),
    detectors: ["raw-errors"],
  });
  const findings = result.results[0].findings;

  test("finds error.message in JSX", () => {
    const msgFindings = findings.filter((f) =>
      f.message.includes("error.message rendered in UI"),
    );
    expect(msgFindings.length).toBeGreaterThan(0);
  });

  test("finds error.stack in UI", () => {
    const stackFindings = findings.filter((f) =>
      f.message.includes("Stack trace rendered in UI"),
    );
    expect(stackFindings.length).toBeGreaterThan(0);
  });

  test("finds toast with error.message", () => {
    const toastFindings = findings.filter((f) =>
      f.message.includes("toast"),
    );
    expect(toastFindings.length).toBeGreaterThan(0);
  });

  test("does NOT flag good error display", () => {
    // GoodErrorDisplay uses a generic message
    const goodFindings = findings.filter((f) =>
      f.source?.includes("Something went wrong. Please try again."),
    );
    expect(goodFindings.length).toBe(0);
  });
});

describe("hardcoded-secrets detector", () => {
  const result = scan({
    rootDir: join(FIXTURES, "secrets"),
    detectors: ["hardcoded-secrets"],
  });
  const findings = result.results[0].findings;

  test("finds hardcoded password", () => {
    const pwFindings = findings.filter((f) =>
      f.message.includes("password"),
    );
    expect(pwFindings.length).toBeGreaterThan(0);
  });

  test("finds Slack token", () => {
    const slack = findings.filter((f) =>
      f.message.includes("Slack"),
    );
    expect(slack.length).toBeGreaterThan(0);
  });

  test("finds database password in connection string", () => {
    const db = findings.filter((f) =>
      f.message.includes("Database password"),
    );
    expect(db.length).toBeGreaterThan(0);
  });

  test("does NOT flag process.env reads", () => {
    const envFindings = findings.filter((f) =>
      f.source?.includes("process.env"),
    );
    expect(envFindings.length).toBe(0);
  });

  test("does NOT flag placeholder values", () => {
    const placeholders = findings.filter((f) =>
      f.source?.includes("your-api-key-here"),
    );
    expect(placeholders.length).toBe(0);
  });
});

describe("unhandled-async detector", () => {
  const result = scan({
    rootDir: join(FIXTURES, "async"),
    detectors: ["unhandled-async"],
  });
  const findings = result.results[0].findings;

  test("finds Promise.all without await or catch", () => {
    const promiseAll = findings.filter((f) =>
      f.message.includes("Promise.all"),
    );
    expect(promiseAll.length).toBe(1);
  });

  test("finds async event handler without try/catch", () => {
    const handlers = findings.filter((f) =>
      f.message.includes("event handler"),
    );
    expect(handlers.length).toBe(1);
  });

  test("does NOT flag awaited Promise.all", () => {
    // "await Promise.all" should not be flagged
    const awaited = findings.filter((f) =>
      f.source?.includes("await Promise.all"),
    );
    expect(awaited.length).toBe(0);
  });

  test("does NOT flag Promise.all with .catch", () => {
    const caught = findings.filter((f) =>
      f.source?.includes(".catch"),
    );
    expect(caught.length).toBe(0);
  });
});

describe("clean codebase", () => {
  const result = scan({
    rootDir: join(FIXTURES, "clean"),
  });

  test("produces zero findings", () => {
    const totalFindings = result.results.reduce(
      (sum, r) => sum + r.findings.length,
      0,
    );
    expect(totalFindings).toBe(0);
  });
});

describe("scanner options", () => {
  test("--detectors filters which detectors run", () => {
    const result = scan({
      rootDir: join(FIXTURES, "silent-errors"),
      detectors: ["silent-errors"],
    });
    expect(result.results.length).toBe(1);
    expect(result.results[0].detector).toBe("silent-errors");
  });

  test("reports filesScanned count", () => {
    const result = scan({ rootDir: join(FIXTURES, "silent-errors") });
    expect(result.filesScanned).toBeGreaterThan(0);
  });

  test("reports duration", () => {
    const result = scan({ rootDir: join(FIXTURES, "clean") });
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});
