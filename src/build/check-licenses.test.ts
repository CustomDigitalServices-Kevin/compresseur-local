import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = join(repoRoot, "scripts", "check-licenses.mjs");

const tempDirs: string[] = [];

function makeTree(pkg: { name: string; version: string; license: string }): string {
  const root = mkdtempSync(join(tmpdir(), "lic-"));
  tempDirs.push(root);
  const pkgDir = join(root, "node_modules", pkg.name);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify(pkg));
  return root;
}

function runCheck(root: string): { status: number | null; output: string } {
  const res = spawnSync(process.execPath, [script], {
    env: { ...process.env, LICENSE_CHECK_ROOT: root },
    encoding: "utf8",
  });
  return { status: res.status, output: `${res.stdout}${res.stderr}` };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

describe("check-licenses script", () => {
  it("exits non-zero on a forbidden (AGPL) dependency", () => {
    const root = makeTree({ name: "evil-lib", version: "1.0.0", license: "AGPL-3.0" });
    const { status, output } = runCheck(root);
    expect(status).toBe(1);
    expect(output).toContain("evil-lib");
    expect(output).toContain("AGPL-3.0");
  });

  it("exits zero when every dependency is on the allowlist", () => {
    const root = makeTree({ name: "good-lib", version: "2.0.0", license: "MIT" });
    const { status } = runCheck(root);
    expect(status).toBe(0);
  });
});
