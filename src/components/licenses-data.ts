// Runtime dependencies only (build tooling -- Vite, TypeScript, ESLint, Vitest
// -- is not bundled and is out of scope here). licenses-page.test.ts locks this
// table against package.json "dependencies" in both directions: adding a
// runtime dependency without listing it here, or leaving a stale entry, fails
// CI. `covers` maps a display row to the package names it credits. (Pattern D14
// from the convertisseur.) T2-T4 add rows here as they bring in @jsquash,
// pdfjs-dist, pdf-lib, fflate, etc.
export interface RuntimeLicenseEntry {
  name: string;
  license: string;
  covers: string[];
}

export const RUNTIME_LICENSES: readonly RuntimeLicenseEntry[] = [
  { name: "react / react-dom", license: "MIT", covers: ["react", "react-dom"] },
];
