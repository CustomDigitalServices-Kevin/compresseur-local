import { createPdfEngine } from "./pdf-engine";
import { offscreenCanvasCodec } from "../image/offscreen-codec";
import { createQpdfOptimizer } from "./structural";
import { countPdfPages } from "./page-count";

// Production (browser worker) composition root for the PDF engine. Vite-specific
// asset loading (?url imports) lives here ONLY -- never in the seams -- so the
// engine itself also runs under plain Node in Vitest with injected loaders
// (gotcha-worker-browser-exports pattern from the convertisseur).

async function loadQpdfWasm(): Promise<WebAssembly.Module> {
  const { default: wasmUrl } = await import("@jspawn/qpdf-wasm/qpdf.wasm?url");
  return WebAssembly.compileStreaming(fetch(wasmUrl));
}

async function countPagesWithWorker(bytes: Uint8Array): Promise<number> {
  // In browser contexts pdfjs needs its worker script URL before the first
  // getDocument call. Under Node (tests) countPdfPages is used directly and
  // pdfjs falls back to its fake worker; this module is never imported there.
  const { GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (GlobalWorkerOptions.workerSrc === "") {
    const { default: workerUrl } = await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url");
    GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return countPdfPages(bytes);
}

// The image module's codec is reused on purpose: when T2 swaps the @jsquash
// backed codec in, the PDF engine picks it up through the same seam.
export const pdfEngine = createPdfEngine({
  codec: offscreenCanvasCodec,
  structural: createQpdfOptimizer(loadQpdfWasm),
  countPages: countPagesWithWorker,
});
