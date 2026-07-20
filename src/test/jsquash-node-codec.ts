import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import decodeJpeg, { init as initJpegDecode } from "@jsquash/jpeg/decode.js";
import encodeJpeg, { init as initJpegEncode } from "@jsquash/jpeg/encode.js";
import type { RasterCodec, SourceDimensions } from "../engines/image/raster-codec";

// Node-side RasterCodec for tests ONLY (@jsquash/jpeg is a devDependency).
// Vitest has no real OffscreenCanvas, and the T3 acceptance criterion (>30%
// gain on a scanned PDF) must be MEASURED, not mocked -- so tests inject this
// codec, which decodes/re-encodes JPEG through mozjpeg WASM plus a pure-TS box
// resize. The wasm binaries are compiled from node_modules via fs because the
// jsquash glue fetches them relative to import.meta.url, which fails in Node.

const require = createRequire(import.meta.url);

let ready: Promise<void> | undefined;

async function ensureJsquashReady(): Promise<void> {
  ready ??= (async () => {
    const [encWasm, decWasm] = await Promise.all([
      WebAssembly.compile(
        await readFile(require.resolve("@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm")),
      ),
      WebAssembly.compile(
        await readFile(require.resolve("@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm")),
      ),
    ]);
    await initJpegEncode(encWasm);
    await initJpegDecode(decWasm);
  })();
  return ready;
}

/** Deterministic area-average (box) downscale of tightly-packed RGBA pixels. */
export function boxResizeRgba(
  source: Uint8ClampedArray<ArrayBuffer>,
  from: SourceDimensions,
  to: SourceDimensions,
): Uint8ClampedArray<ArrayBuffer> {
  if (to.width === from.width && to.height === from.height) return source;
  const out = new Uint8ClampedArray(to.width * to.height * 4);
  for (let ty = 0; ty < to.height; ty++) {
    const y0 = Math.floor((ty * from.height) / to.height);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * from.height) / to.height));
    for (let tx = 0; tx < to.width; tx++) {
      const x0 = Math.floor((tx * from.width) / to.width);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * from.width) / to.width));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const count = (x1 - x0) * (y1 - y0);
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const s = (sy * from.width + sx) * 4;
          r += source[s] ?? 0;
          g += source[s + 1] ?? 0;
          b += source[s + 2] ?? 0;
          a += source[s + 3] ?? 0;
        }
      }
      const t = (ty * to.width + tx) * 4;
      out[t] = Math.round(r / count);
      out[t + 1] = Math.round(g / count);
      out[t + 2] = Math.round(b / count);
      out[t + 3] = Math.round(a / count);
    }
  }
  return out;
}

/** Encodes tightly-packed RGBA pixels to JPEG at a 1..100 quality (fixtures). */
export async function encodeRgbaToJpeg(
  rgba: Uint8ClampedArray<ArrayBuffer>,
  dims: SourceDimensions,
  quality: number,
): Promise<Uint8Array> {
  await ensureJsquashReady();
  // Structurally compatible with ImageData (encode only reads data/width/height);
  // Node has no ImageData constructor, hence the plain literal.
  const imageData: ImageData = {
    data: rgba,
    width: dims.width,
    height: dims.height,
    colorSpace: "srgb",
  };
  const buffer = await encodeJpeg(imageData, { quality });
  return new Uint8Array(buffer);
}

export function createJsquashNodeCodec(): RasterCodec {
  return {
    async reencode(data, _sourceMime, planFor) {
      await ensureJsquashReady();
      const decoded = await decodeJpeg(data);
      const source: SourceDimensions = { width: decoded.width, height: decoded.height };
      const plan = planFor(source);
      if (plan.mimeType !== "image/jpeg") {
        throw new Error(`jsquash test codec only encodes image/jpeg, got ${plan.mimeType}`);
      }
      const target: SourceDimensions = { width: plan.targetWidth, height: plan.targetHeight };
      const pixels = boxResizeRgba(decoded.data, source, target);
      const quality = Math.round((plan.quality ?? 0.75) * 100);
      const bytes = await encodeRgbaToJpeg(pixels, target, quality);
      const blobPart = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(blobPart).set(bytes);
      return new Blob([blobPart], { type: "image/jpeg" });
    },
  };
}
