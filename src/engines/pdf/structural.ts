// Imports the CJS Emscripten glue DIRECTLY instead of the package root.
//
// The package root resolves to qpdf.mjs, a wrapper that only works when
// qpdf.js is evaluated as a classic script: it sets `globalThis.exports = {}`
// (browser.js), lets the UMD tail of qpdf.js fall into its
// `exports["Module"] = Module` branch, reads it back, and otherwise falls back
// to a bare global `createModule`. Under Vite that wrapper is broken: Rollup
// gives qpdf.js its own CJS `module`/`exports` bindings, so the UMD tail takes
// the `module.exports = Module` branch instead, `globalThis.exports.Module`
// stays undefined, and the fallback throws "createModule is not defined" in the
// worker (caught by the E2E PDF smoke, 2026-07-20 -- Vitest never saw it
// because Node takes qpdf.mjs's `require` branch, which does work).
//
// Importing qpdf.js directly takes the interop default export (= module.exports
// = the factory) in BOTH environments, and as a bonus drops qpdf.mjs's dynamic
// `import("path")`/`import("module")` calls -- the Node branches Vite used to
// externalize with a warning.
import initQpdf from "@jspawn/qpdf-wasm/qpdf.js";
import { CompressionError } from "../../core/types";

// Structural optimization pass behind a seam: qpdf (WASM CLI) repacks the
// document -- object streams, stream compression, flate recompression --
// after the image pass rewrote the JPEG XObjects. The wasm loading is injected
// (Vite ?url + fetch in the browser, fs in Node tests) so this file stays
// environment-agnostic.

export type QpdfWasmLoader = () => Promise<WebAssembly.Module>;

export interface StructuralOptimizer {
  optimize(bytes: Uint8Array): Promise<Uint8Array>;
}

/** Runs the qpdf CLI as `qpdf /in.pdf <args> /out.pdf` on an in-memory FS. */
export type QpdfRun = (args: readonly string[], input: Uint8Array) => Promise<Uint8Array>;

/**
 * qpdf arguments of the structural pass.
 *
 * `--linearize` is deliberately ABSENT: measured on a 40-page text PDF
 * (2026-07-20 spike) it collapsed the structural gain from 26.1% to 2.5% --
 * linearization appends hint streams and padding for progressive web viewing,
 * which is irrelevant for a local compressor whose one goal is size.
 */
export const QPDF_STRUCTURAL_ARGS: readonly string[] = [
  "--object-streams=generate",
  "--compress-streams=y",
  "--recompress-flate",
];

/** qpdf: warnings were found without errors. The output file IS written. */
export const QPDF_EXIT_WARNINGS = 3;

/**
 * qpdf exit codes: 0 = clean, 3 = warnings but no error (the output file IS
 * written), 2 = errors, nothing usable produced.
 * https://qpdf.readthedocs.io/en/stable/cli.html
 *
 * Real-world PDFs very often exit 3 (slightly non-conforming objects). Treating
 * that as a failure made compression fail on most genuine documents -- caught
 * in production on 2026-07-20, invisible to the pdf-lib fixtures which all
 * exit 0. Output validity is still enforced downstream by the pdfjs reopen and
 * the page-count check, as the qpdf docs warn that recovery is not guaranteed.
 */
export function isAcceptableQpdfExit(exitCode: number): boolean {
  return exitCode === 0 || exitCode === QPDF_EXIT_WARNINGS;
}

/**
 * Creates a runner with a lazily-compiled, cached wasm module. Each run gets a
 * fresh Emscripten instance (cheap once compiled): qpdf mutates its MEMFS and
 * process state, so instances are never reused across runs.
 */
export function createQpdfRunner(loadWasm: QpdfWasmLoader): QpdfRun {
  let compiled: Promise<WebAssembly.Module> | undefined;
  return async (args, input) => {
    compiled ??= loadWasm();
    const wasmModule = await compiled;
    const stderr: string[] = [];
    const qpdf = await initQpdf({
      instantiateWasm(imports, done) {
        void WebAssembly.instantiate(wasmModule, imports).then(done);
        return {};
      },
      noInitialRun: true,
      print: () => undefined,
      printErr: (line: string) => {
        stderr.push(line);
      },
    });
    qpdf.FS.writeFile("/in.pdf", input);
    let exitCode: number;
    try {
      exitCode = qpdf.callMain(["/in.pdf", ...args, "/out.pdf"]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new CompressionError("internal-error", `qpdf crashed: ${detail}`);
    }
    if (!isAcceptableQpdfExit(exitCode)) {
      const tail = stderr.slice(-3).join(" | ");
      throw new CompressionError(
        "internal-error",
        `qpdf exited with ${exitCode.toString()}: ${tail}`,
      );
    }
    return qpdf.FS.readFile("/out.pdf");
  };
}

export function createQpdfOptimizer(loadWasm: QpdfWasmLoader): StructuralOptimizer {
  const run = createQpdfRunner(loadWasm);
  return { optimize: (bytes) => run(QPDF_STRUCTURAL_ARGS, bytes) };
}
