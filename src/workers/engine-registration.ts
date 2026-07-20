import { registerEngine } from "../core/registry";

// Registers every available family engine with a lazy dynamic import so Vite
// code-splits one chunk (JS + WASM) per family. "image" ships since T1, "pdf"
// since T3.
//
// "office" is intentionally NOT registered yet: a job for that family throws
// EngineNotRegisteredError (real behavior, not a placeholder), which the UI
// surfaces as "engine coming soon". T4 adds its line here.
export function registerBundledEngines(): void {
  registerEngine("image", async () => (await import("../engines/image/module")).imageEngine);
  registerEngine("pdf", async () => (await import("../engines/pdf/module")).pdfEngine);
}
