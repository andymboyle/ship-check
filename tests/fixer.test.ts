import { describe, expect, test, afterEach } from "vitest";
import { join } from "path";
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "fs";
import { applyFixes } from "../src/fixer";
import type { Finding } from "../src/types";

const TMP = join(__dirname, "fixtures", "_tmp_fixer");

function setup(files: Record<string, string>) {
  rmSync(TMP, { recursive: true, force: true });
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(TMP, path);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content);
  }
}

function readFixed(path: string): string {
  return readFileSync(join(TMP, path), "utf-8");
}

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("fetch timeout fix", () => {
  test("adds AbortSignal to simple fetch(url)", () => {
    setup({
      "src/api.ts": 'const res = await fetch("https://api.example.com");\n',
    });
    const finding: Finding = {
      detector: "missing-timeouts",
      severity: "HIGH",
      file: "src/api.ts",
      line: 1,
      message: "fetch without timeout",
      fix: "Add AbortSignal",
      fixable: true,
      _fixId: "fetch-no-timeout",
    };
    const fixes = applyFixes(TMP, [finding]);
    expect(fixes.length).toBe(1);
    const content = readFixed("src/api.ts");
    expect(content).toContain("AbortSignal.timeout(30_000)");
    expect(content).toContain("signal:");
  });

  test("adds AbortSignal to fetch(url, { headers })", () => {
    setup({
      "src/api.ts": 'const res = await fetch("https://api.example.com", { headers: { "X-Auth": "token" } });\n',
    });
    const finding: Finding = {
      detector: "missing-timeouts",
      severity: "HIGH",
      file: "src/api.ts",
      line: 1,
      message: "fetch without timeout",
      fix: "Add AbortSignal",
      fixable: true,
      _fixId: "fetch-no-timeout",
    };
    const fixes = applyFixes(TMP, [finding]);
    expect(fixes.length).toBe(1);
    const content = readFixed("src/api.ts");
    expect(content).toContain("AbortSignal.timeout(30_000)");
    expect(content).toContain("headers");
  });
});

describe("Python timeout fixes", () => {
  test("adds timeout to httpx.AsyncClient()", () => {
    setup({
      "src/client.py": "client = httpx.AsyncClient()\n",
    });
    const finding: Finding = {
      detector: "missing-timeouts",
      severity: "HIGH",
      file: "src/client.py",
      line: 1,
      message: "httpx without timeout",
      fix: "Add timeout",
      fixable: true,
      _fixId: "httpx-no-timeout",
    };
    const fixes = applyFixes(TMP, [finding]);
    expect(fixes.length).toBe(1);
    const content = readFixed("src/client.py");
    expect(content).toContain("timeout=30.0");
  });

  test("adds timeout to httpx.AsyncClient(base_url=...)", () => {
    setup({
      "src/client.py": 'client = httpx.AsyncClient(base_url="https://api.example.com")\n',
    });
    const finding: Finding = {
      detector: "missing-timeouts",
      severity: "HIGH",
      file: "src/client.py",
      line: 1,
      message: "httpx without timeout",
      fix: "Add timeout",
      fixable: true,
      _fixId: "httpx-no-timeout",
    };
    const fixes = applyFixes(TMP, [finding]);
    expect(fixes.length).toBe(1);
    const content = readFixed("src/client.py");
    expect(content).toContain("timeout=30.0");
    expect(content).toContain("base_url");
  });

  test("adds timeout to requests.get(url)", () => {
    setup({
      "src/api.py": 'response = requests.get("https://api.example.com/data")\n',
    });
    const finding: Finding = {
      detector: "missing-timeouts",
      severity: "HIGH",
      file: "src/api.py",
      line: 1,
      message: "requests without timeout",
      fix: "Add timeout",
      fixable: true,
      _fixId: "requests-no-timeout",
    };
    const fixes = applyFixes(TMP, [finding]);
    expect(fixes.length).toBe(1);
    const content = readFixed("src/api.py");
    expect(content).toContain("timeout=30");
  });

  test("adds timeout to redis.Redis()", () => {
    setup({
      "src/cache.py": 'r = redis.Redis(host="localhost", port=6379)\n',
    });
    const finding: Finding = {
      detector: "missing-timeouts",
      severity: "HIGH",
      file: "src/cache.py",
      line: 1,
      message: "Redis without timeout",
      fix: "Add timeout",
      fixable: true,
      _fixId: "redis-py-no-timeout",
    };
    const fixes = applyFixes(TMP, [finding]);
    expect(fixes.length).toBe(1);
    const content = readFixed("src/cache.py");
    expect(content).toContain("socket_timeout=5");
    expect(content).toContain("socket_connect_timeout=5");
  });
});

describe("axios fix", () => {
  test("adds timeout to axios.create({})", () => {
    setup({
      "src/client.ts": 'const client = axios.create({ baseURL: "https://api.example.com" });\n',
    });
    const finding: Finding = {
      detector: "missing-timeouts",
      severity: "HIGH",
      file: "src/client.ts",
      line: 1,
      message: "axios without timeout",
      fix: "Add timeout",
      fixable: true,
      _fixId: "axios-create-no-timeout",
    };
    const fixes = applyFixes(TMP, [finding]);
    expect(fixes.length).toBe(1);
    const content = readFixed("src/client.ts");
    expect(content).toContain("timeout: 30_000");
    expect(content).toContain("baseURL");
  });
});

describe("multiple fixes in one file", () => {
  test("applies fixes at different lines without corrupting", () => {
    setup({
      "src/api.py": [
        "import httpx",
        "import requests",
        "",
        "client = httpx.AsyncClient()",
        'response = requests.get("https://example.com")',
        "",
      ].join("\n"),
    });
    const findings: Finding[] = [
      {
        detector: "missing-timeouts",
        severity: "HIGH",
        file: "src/api.py",
        line: 4,
        message: "httpx",
        fix: "timeout",
        fixable: true,
        _fixId: "httpx-no-timeout",
      },
      {
        detector: "missing-timeouts",
        severity: "HIGH",
        file: "src/api.py",
        line: 5,
        message: "requests",
        fix: "timeout",
        fixable: true,
        _fixId: "requests-no-timeout",
      },
    ];
    const fixes = applyFixes(TMP, findings);
    expect(fixes.length).toBe(2);
    const content = readFixed("src/api.py");
    expect(content).toContain("timeout=30.0");
    expect(content).toContain("timeout=30");
  });
});

describe("non-fixable findings are skipped", () => {
  test("findings without fixable flag are ignored", () => {
    setup({
      "src/app.ts": "some code\n",
    });
    const finding: Finding = {
      detector: "silent-errors",
      severity: "HIGH",
      file: "src/app.ts",
      line: 1,
      message: "not fixable",
      fix: "manual fix needed",
    };
    const fixes = applyFixes(TMP, [finding]);
    expect(fixes.length).toBe(0);
  });
});
