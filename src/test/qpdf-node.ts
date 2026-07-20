import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

// Test-side qpdf wasm loader: reads the binary from node_modules with fs (the
// production module loads it through a Vite ?url import + fetch instead).
export async function loadQpdfWasmForNode(): Promise<WebAssembly.Module> {
  const require = createRequire(import.meta.url);
  return WebAssembly.compile(await readFile(require.resolve("@jspawn/qpdf-wasm/qpdf.wasm")));
}
