import initQpdf from "@jspawn/qpdf-wasm";
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
    if (exitCode !== 0) {
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
