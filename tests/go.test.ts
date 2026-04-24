import { describe, expect, test } from "vitest";
import { join } from "path";
import { scan } from "../src/scanner";

const FIXTURES = join(__dirname, "fixtures");

describe("Go: silent-errors detector", () => {
  const result = scan({
    rootDir: join(FIXTURES, "go-project"),
    detectors: ["silent-errors"],
  });
  const findings = result.results[0].findings;

  test("finds empty error handling block", () => {
    const empty = findings.filter((f) =>
      f.message.includes("Empty error handling block"),
    );
    expect(empty.length).toBe(1);
    expect(empty[0].severity).toBe("HIGH");
  });

  test("finds bare return discarding error", () => {
    const bareReturn = findings.filter((f) =>
      f.message.includes("bare return"),
    );
    expect(bareReturn.length).toBe(1);
    expect(bareReturn[0].severity).toBe("MEDIUM");
  });

  test("does NOT flag error handling with logging", () => {
    const logged = findings.filter((f) =>
      f.source?.includes("log.Printf"),
    );
    expect(logged.length).toBe(0);
  });
});

describe("Go: missing-timeouts detector", () => {
  const result = scan({
    rootDir: join(FIXTURES, "go-project"),
    detectors: ["missing-timeouts"],
  });
  const findings = result.results[0].findings;

  test("finds http.Client without Timeout", () => {
    const noTimeout = findings.filter((f) =>
      f.message.includes("http.Client without Timeout"),
    );
    expect(noTimeout.length).toBe(1);
  });

  test("finds http.Get (DefaultClient)", () => {
    const defaultClient = findings.filter((f) =>
      f.message.includes("DefaultClient"),
    );
    expect(defaultClient.length).toBeGreaterThan(0);
  });

  test("does NOT flag http.Client with Timeout", () => {
    const withTimeout = findings.filter((f) =>
      f.source?.includes("30 * time.Second"),
    );
    expect(withTimeout.length).toBe(0);
  });
});
