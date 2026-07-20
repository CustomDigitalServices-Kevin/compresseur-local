// License gate (PRD: product is MIT, AGPL forbidden, bundled LGPL forbidden).
// Fails the build if any installed package (prod OR dev, at any depth) declares
// a license outside the allowlist. Copyleft licenses (AGPL/LGPL/GPL) are never
// on the allowlist, so they always trigger a violation -- the app bundles
// everything client-side, so a single copyleft dependency would contaminate it.
//
// The scanned root defaults to this project but can be overridden with the
// LICENSE_CHECK_ROOT env var, which is how the test suite points the same code
// at a simulated node_modules tree containing a forbidden package.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Permissive, non-copyleft SPDX ids. The first block is the PRD-mandated core;
// the rest are OSI-approved permissive licenses that show up transitively in
// the Vite / ESLint / TypeScript / Vitest tool tree and carry no copyleft.
export const ALLOWED = new Set([
  // PRD core allowlist.
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "MPL-2.0",
  // Additional permissive ids pulled in by build tooling.
  "CC0-1.0",
  "Unlicense",
  "BlueOak-1.0.0",
  "CC-BY-4.0",
  "Python-2.0",
  "Zlib",
]);

// Packages whose npm "license" field is legacy free text instead of a valid
// SPDX id. Each entry must be manually verified against the upstream LICENSE
// file (note the source + date) so the exception stays auditable.
export const VERIFIED_EXCEPTIONS = {};

function listPackageDirs(dir) {
  const dirs = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.name.startsWith("@")) {
      dirs.push(...listPackageDirs(full));
    } else {
      dirs.push(full);
    }
  }
  return dirs;
}

// Handles plain ids and simple SPDX expressions like "(MIT OR Apache-2.0)"
// and "(MIT AND Zlib)". An OR expression passes if any operand is allowed; an
// AND expression passes only if every operand is allowed.
export function licenseExpressionAllowed(expression) {
  const cleaned = expression.replaceAll("(", "").replaceAll(")", "");
  if (cleaned.includes(" OR ")) {
    return cleaned.split(" OR ").some((part) => ALLOWED.has(part.trim()));
  }
  return cleaned.split(" AND ").every((part) => ALLOWED.has(part.trim()));
}

export function collectViolations(nodeModulesDir) {
  if (!existsSync(nodeModulesDir)) return [];
  const violations = [];
  for (const dir of listPackageDirs(nodeModulesDir)) {
    const manifestPath = join(dir, "package.json");
    if (!existsSync(manifestPath)) continue;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      continue;
    }
    const license =
      typeof manifest.license === "string"
        ? manifest.license
        : (manifest.license?.type ?? manifest.licenses?.[0]?.type ?? "UNKNOWN");
    const exception = VERIFIED_EXCEPTIONS[manifest.name ?? ""];
    const allowed = exception !== undefined ? true : licenseExpressionAllowed(license);
    if (!allowed) {
      violations.push(`${manifest.name ?? dir}@${manifest.version ?? "?"} -> ${license}`);
    }
  }
  return violations;
}

function projectNodeModules() {
  const envRoot = process.env.LICENSE_CHECK_ROOT;
  const root = envRoot ?? fileURLToPath(new URL("..", import.meta.url));
  return join(root, "node_modules");
}

// Only run the CLI side-effects when executed directly, not when imported by a
// test. import.meta.url ends with this file's path when run as `node ...mjs`.
const invokedDirectly =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const violations = collectViolations(projectNodeModules());
  if (violations.length > 0) {
    console.error("License check FAILED. Disallowed licenses found:");
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exit(1);
  }
  console.log("License check passed: all installed packages are on the allowlist.");
}
