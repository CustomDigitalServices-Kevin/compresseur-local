import { registerEngine } from "../core/registry";

// Registers every available family engine with a lazy dynamic import so Vite
// code-splits one chunk (JS + WASM) per family. Only "image" ships in T1.
//
// "pdf" and "office" are intentionally NOT registered yet: a job for those
// families throws EngineNotRegisteredError (real behavior, not a placeholder),
// which the UI surfaces as "engine coming soon". T3 and T4 add their lines here.
export function registerBundledEngines(): void {
  registerEngine("image", async () => (await import("../engines/image/module")).imageEngine);
}
