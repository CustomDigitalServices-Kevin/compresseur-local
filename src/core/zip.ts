import { zipSync } from "fflate";

export interface ZipEntryFile {
  name: string;
  data: Uint8Array;
}

/**
 * Builds an in-memory ZIP from already-compressed outputs.
 *
 * STORE (level 0): every payload here is a compression RESULT (re-encoded
 * image, optimized PDF, re-zipped OOXML), already entropy-coded, so deflating
 * it again wastes CPU for ~0% gain. At level 0 zipSync is a structured memory
 * copy, fast enough on the main thread even for tens of MB, which keeps a
 * whole zip-worker out of the design. (Same trade-off as the convertisseur.)
 */
export function createZip(files: ZipEntryFile[]): Blob {
  const entries: Record<string, Uint8Array> = {};
  const seen = new Set<string>();
  for (const file of files) {
    // Zip entry names must be unique; batches can produce collisions.
    let name = file.name;
    let counter = 1;
    while (seen.has(name)) {
      const dot = file.name.lastIndexOf(".");
      name =
        dot === -1
          ? `${file.name} (${String(counter)})`
          : `${file.name.slice(0, dot)} (${String(counter)})${file.name.slice(dot)}`;
      counter += 1;
    }
    seen.add(name);
    entries[name] = file.data;
  }
  const zipped = zipSync(entries, { level: 0 });
  return new Blob([zipped], { type: "application/zip" });
}
