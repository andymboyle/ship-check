import { describe, expect, test, afterEach } from "vitest";
import { join } from "path";
import { writeFileSync, mkdirSync, rmSync, symlinkSync } from "fs";
import { walkSourceFiles, isTestFile } from "../src/walker";

const TMP = join(__dirname, "fixtures", "_tmp_walker");

function setup(files: Record<string, string>) {
  rmSync(TMP, { recursive: true, force: true });
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(TMP, path);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content);
  }
}

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("walkSourceFiles", () => {
  test("finds source files by extension", () => {
    setup({
      "src/app.ts": "code",
      "src/util.py": "code",
      "src/main.go": "code",
      "README.md": "not source",
      "config.json": "not source",
    });
    const files = walkSourceFiles(TMP);
    const relPaths = files.map((f) => f.relPath);
    expect(relPaths).toContain("src/app.ts");
    expect(relPaths).toContain("src/util.py");
    expect(relPaths).toContain("src/main.go");
    expect(relPaths).not.toContain("README.md");
    expect(relPaths).not.toContain("config.json");
  });

  test("skips node_modules and hidden dirs", () => {
    setup({
      "src/app.ts": "code",
      "node_modules/pkg/index.js": "code",
      ".hidden/secret.ts": "code",
    });
    const files = walkSourceFiles(TMP);
    expect(files.length).toBe(1);
    expect(files[0].relPath).toBe("src/app.ts");
  });

  test("skips symlinks", () => {
    setup({
      "src/real.ts": "code",
    });
    symlinkSync(join(TMP, "src/real.ts"), join(TMP, "src/linked.ts"));

    const files = walkSourceFiles(TMP);
    const relPaths = files.map((f) => f.relPath);
    expect(relPaths).toContain("src/real.ts");
    expect(relPaths).not.toContain("src/linked.ts");
  });

  test("skips files over maxFileSize", () => {
    setup({
      "src/small.ts": "x",
      "src/big.ts": "x".repeat(200),
    });
    const files = walkSourceFiles(TMP, { maxFileSize: 100 });
    expect(files.length).toBe(1);
    expect(files[0].relPath).toBe("src/small.ts");
  });

  test("respects exclude patterns", () => {
    setup({
      "src/app.ts": "code",
      "generated/types.ts": "code",
    });
    const files = walkSourceFiles(TMP, { exclude: ["generated/"] });
    expect(files.length).toBe(1);
    expect(files[0].relPath).toBe("src/app.ts");
  });

  test("populates isTest flag", () => {
    setup({
      "src/app.ts": "code",
      "src/app.test.ts": "test",
      "src/app.spec.ts": "test",
      "__tests__/foo.ts": "test",
    });
    const files = walkSourceFiles(TMP);
    const app = files.find((f) => f.relPath === "src/app.ts");
    const testFile = files.find((f) => f.relPath === "src/app.test.ts");
    const specFile = files.find((f) => f.relPath === "src/app.spec.ts");
    expect(app?.isTest).toBe(false);
    expect(testFile?.isTest).toBe(true);
    expect(specFile?.isTest).toBe(true);
  });

  test("reads file content and splits lines", () => {
    setup({
      "src/app.ts": "line1\nline2\nline3",
    });
    const files = walkSourceFiles(TMP);
    expect(files[0].content).toBe("line1\nline2\nline3");
    expect(files[0].lines).toEqual(["line1", "line2", "line3"]);
  });
});

describe("isTestFile", () => {
  test("matches .test. files", () => {
    expect(isTestFile("src/app.test.ts")).toBe(true);
  });

  test("matches .spec. files", () => {
    expect(isTestFile("src/app.spec.ts")).toBe(true);
  });

  test("matches __tests__ directory", () => {
    expect(isTestFile("__tests__/foo.ts")).toBe(true);
  });

  test("matches e2e/ directory", () => {
    expect(isTestFile("e2e/login.ts")).toBe(true);
  });

  test("matches playwright/ directory", () => {
    expect(isTestFile("playwright/oauth.ts")).toBe(true);
  });

  test("matches .stories. files", () => {
    expect(isTestFile("src/Button.stories.tsx")).toBe(true);
  });

  test("does NOT match regular source files", () => {
    expect(isTestFile("src/app.ts")).toBe(false);
    expect(isTestFile("src/utils/helpers.py")).toBe(false);
  });
});
