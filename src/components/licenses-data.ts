// Runtime dependencies only (build tooling -- Vite, TypeScript, ESLint, Vitest
// -- is not bundled and is out of scope here). licenses-page.test.ts locks this
// table against package.json "dependencies" in both directions: adding a
// runtime dependency without listing it here, or leaving a stale entry, fails
// CI. `covers` maps a display row to the package names it credits. (Pattern D14
// from the convertisseur.) T3-T4 add rows here as they bring in pdfjs-dist,
// pdf-lib, fflate, etc.
// from the convertisseur.) T2-T3 add rows here as they bring in @jsquash,
// from the convertisseur.) T2-T4 add rows here as they bring in @jsquash,
// pdfjs-dist, pdf-lib, etc.
export interface RuntimeLicenseEntry {
  name: string;
  license: string;
  covers: string[];
}

export const RUNTIME_LICENSES: readonly RuntimeLicenseEntry[] = [
  { name: "react / react-dom", license: "MIT", covers: ["react", "react-dom"] },
  // T3 (pdf engine). @jsquash/jpeg stays a devDependency (Node test codec only,
  // never bundled) so it is intentionally NOT listed here.
  { name: "pdf-lib", license: "MIT", covers: ["pdf-lib"] },
  { name: "PDF.js", license: "Apache-2.0", covers: ["pdfjs-dist"] },
  { name: "qpdf (WASM)", license: "Apache-2.0", covers: ["@jspawn/qpdf-wasm"] },
  {
    name: "jSquash image codecs (MozJPEG, Squoosh PNG, libwebp, libavif, Oxipng)",
    license: "Apache-2.0",
    covers: ["@jsquash/jpeg", "@jsquash/png", "@jsquash/webp", "@jsquash/avif", "@jsquash/oxipng"],
  },
  { name: "fflate", license: "MIT", covers: ["fflate"] },
];
