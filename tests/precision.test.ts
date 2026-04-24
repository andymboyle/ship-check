import { describe, expect, test } from "vitest";
import { join } from "path";
import { scan } from "../src/scanner";

const PRECISION_DIR = join(__dirname, "precision");

/**
 * Precision test suite: run detectors against curated fixtures
 * with known-correct classifications.
 *
 * true-positives/  — files with real problems. Every HIGH finding is expected.
 * false-positives/ — files with safe patterns. No HIGH findings should appear.
 *
 * This gives us automated precision/recall measurement on every change.
 */

describe("precision: true positives should be detected", () => {
  const result = scan({
    rootDir: join(PRECISION_DIR, "true-positives"),
  });
  const allFindings = result.results.flatMap((r) => r.findings);
  const highFindings = allFindings.filter((f) => f.severity === "HIGH");

  test("finds missing timeout findings in external fetch calls", () => {
    // Only explicit https:// URLs in server-side code are HIGH now
    // Variable URLs (${this.url}/...) are MEDIUM since they could be internal
    const timeouts = allFindings.filter((f) => f.detector === "missing-timeouts");
    expect(timeouts.length).toBeGreaterThanOrEqual(4);
    const highTimeouts = highFindings.filter((f) => f.detector === "missing-timeouts");
    expect(highTimeouts.length).toBeGreaterThanOrEqual(2);
  });

  test("finds silent error swallowing", () => {
    const silent = allFindings.filter(
      (f) => f.detector === "silent-errors" && (f.severity === "HIGH" || f.severity === "MEDIUM"),
    );
    expect(silent.length).toBeGreaterThanOrEqual(2);
  });

  test("finds Python bare except: pass", () => {
    const pyFindings = allFindings.filter(
      (f) => f.detector === "silent-errors" && f.file.endsWith(".py"),
    );
    expect(pyFindings.length).toBeGreaterThanOrEqual(1);
  });

  test("finds fire-and-forget Promise.all", () => {
    const async = highFindings.filter((f) => f.detector === "unhandled-async");
    expect(async.length).toBeGreaterThanOrEqual(1);
  });

  test("finds raw error.message in JSX", () => {
    const raw = highFindings.filter((f) => f.detector === "raw-errors");
    expect(raw.length).toBeGreaterThanOrEqual(1);
  });

  test("finds hardcoded secrets", () => {
    const secrets = highFindings.filter((f) => f.detector === "hardcoded-secrets");
    expect(secrets.length).toBeGreaterThanOrEqual(1);
  });
});

describe("precision: false positives should NOT be detected", () => {
  const result = scan({
    rootDir: join(PRECISION_DIR, "false-positives"),
  });
  const allFindings = result.results.flatMap((r) => r.findings);
  const highFindings = allFindings.filter((f) => f.severity === "HIGH");

  test("no HIGH findings in false-positive fixtures", () => {
    if (highFindings.length > 0) {
      const details = highFindings
        .map((f) => `  ${f.detector}: ${f.file}:${f.line} — ${f.message}`)
        .join("\n");
      throw new Error(
        `Found ${highFindings.length} false positive HIGH finding(s):\n${details}`,
      );
    }
  });

  test("no missing-timeout findings on tRPC/internal/typed calls", () => {
    const timeouts = allFindings.filter((f) => f.detector === "missing-timeouts");
    expect(timeouts.length).toBe(0);
  });

  test("no silent-error findings on localStorage/JSON.parse/cleanup patterns", () => {
    const silent = highFindings.filter((f) => f.detector === "silent-errors");
    expect(silent.length).toBe(0);
  });

  test("no unhandled-async findings on returned/awaited/allSettled promises", () => {
    const async = allFindings.filter((f) => f.detector === "unhandled-async");
    expect(async.length).toBe(0);
  });

  test("no raw-error findings on server-side logging", () => {
    const raw = highFindings.filter((f) => f.detector === "raw-errors");
    expect(raw.length).toBe(0);
  });

  test("no hardcoded-secret findings on enums/placeholders/env vars", () => {
    const secrets = allFindings.filter((f) => f.detector === "hardcoded-secrets");
    expect(secrets.length).toBe(0);
  });
});

describe("precision summary", () => {
  test("prints precision metrics", () => {
    const tpResult = scan({ rootDir: join(PRECISION_DIR, "true-positives") });
    const fpResult = scan({ rootDir: join(PRECISION_DIR, "false-positives") });

    const tpFindings = tpResult.results.flatMap((r) => r.findings);
    const fpFindings = fpResult.results.flatMap((r) => r.findings);

    const tpHigh = tpFindings.filter((f) => f.severity === "HIGH").length;
    const fpHigh = fpFindings.filter((f) => f.severity === "HIGH").length;

    // This test always passes — it just reports the numbers
    console.log(`\n  Precision metrics:`);
    console.log(`    True positive fixtures: ${tpHigh} HIGH findings (expected: >0)`);
    console.log(`    False positive fixtures: ${fpHigh} HIGH findings (expected: 0)`);
    console.log(`    Precision: ${fpHigh === 0 ? "100%" : `${Math.round((1 - fpHigh / (tpHigh + fpHigh)) * 100)}%`}`);

    expect(tpHigh).toBeGreaterThan(0);
  });
});
