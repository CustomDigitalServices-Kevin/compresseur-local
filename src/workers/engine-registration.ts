import { registerEngine } from "../core/registry";

// Registers every available family engine with a lazy dynamic import so Vite
// code-splits one chunk (JS + WASM) per family. All three families ship:
// "image" since T1 (jSquash codecs since T2), "pdf" since T3, "office" since T4.
export function registerBundledEngines(): void {
  registerEngine("image", async () => (await import("../engines/image/module")).imageEngine);
  registerEngine("pdf", async () => (await import("../engines/pdf/module")).pdfEngine);
  registerEngine("office", async () => (await import("../engines/office/module")).officeEngine);
}
