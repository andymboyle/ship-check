import { describe, expect, test, afterAll } from "vitest";
import { join } from "path";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync, rmSync } from "fs";

const TMP = join(__dirname, "fixtures", "_tmp_cli");
const CLI = join(__dirname, "..", "src", "cli.ts");
const FIXTURES = join(__dirname, "fixtures");

function setup(files: Record<string, string>) {
  rmSync(TMP, { recursive: true, force: true });
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(TMP, path);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content);
  }
}

function run(args: string = ""): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(
      `npx tsx ${CLI} ${args}`,
      { encoding: "utf-8", timeout: 15000, cwd: join(__dirname, "..") },
    );
    return { stdout, exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? "", exitCode: err.status ?? 1 };
  }
}

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("CLI exit codes", () => {
  test("exits 0 by default even with findings", () => {
    const { exitCode } = run(`${join(FIXTURES, "silent-errors")}`);
    expect(exitCode).toBe(0);
  });

  test("exits 1 with --ci when HIGH findings exist", () => {
    const { exitCode } = run(`${join(FIXTURES, "silent-errors")} --ci`);
    expect(exitCode).toBe(1);
  });

  test("exits 0 with --ci on clean project", () => {
    const { exitCode } = run(`${join(FIXTURES, "clean")} --ci`);
    expect(exitCode).toBe(0);
  });
});

describe("CLI output modes", () => {
  test("--json outputs valid JSON", () => {
    const { stdout } = run(`${join(FIXTURES, "silent-errors")} --json`);
    const parsed = JSON.parse(stdout);
    expect(parsed.results).toBeDefined();
    expect(parsed.summary).toBeDefined();
    expect(typeof parsed.summary.totalFindings).toBe("number");
  });

  test("--md outputs markdown", () => {
    const { stdout } = run(`${join(FIXTURES, "silent-errors")} --md`);
    expect(stdout).toContain("# ship-check report");
  });

  test("--verbose shows full details", () => {
    const { stdout } = run(`${join(FIXTURES, "silent-errors")} --verbose`);
    expect(stdout).toContain("Fix:");
  });

  test("default shows summary", () => {
    const { stdout } = run(`${join(FIXTURES, "silent-errors")}`);
    expect(stdout).toContain("ship-check");
    expect(stdout).toContain("Summary");
  });
});

describe("CLI filtering", () => {
  test("--severity=HIGH filters to HIGH only", () => {
    const { stdout } = run(`${join(FIXTURES, "silent-errors")} --json --severity=HIGH`);
    const parsed = JSON.parse(stdout);
    for (const dr of parsed.results) {
      for (const f of dr.findings) {
        expect(f.severity).toBe("HIGH");
      }
    }
  });

  test("--only runs specific detector", () => {
    const { stdout } = run(`${join(FIXTURES, "silent-errors")} --json --only=silent-errors`);
    const parsed = JSON.parse(stdout);
    expect(parsed.results.length).toBe(1);
    expect(parsed.results[0].detector).toBe("silent-errors");
  });

  test("detector name as positional arg", () => {
    const { stdout } = run(`silent-errors ${join(FIXTURES, "silent-errors")} --json`);
    const parsed = JSON.parse(stdout);
    expect(parsed.results.length).toBe(1);
    expect(parsed.results[0].detector).toBe("silent-errors");
  });
});

describe("CLI --list", () => {
  test("lists all detectors", () => {
    const { stdout } = run("--list");
    expect(stdout).toContain("silent-errors");
    expect(stdout).toContain("missing-timeouts");
    expect(stdout).toContain("unbounded-queries");
    expect(stdout).toContain("raw-errors");
    expect(stdout).toContain("hardcoded-secrets");
    expect(stdout).toContain("unhandled-async");
  });
});
