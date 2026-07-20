import { CompressionError } from "../../core/types";
import type { PixelOps } from "./jsquash-codec";

// Production PixelOps. createImageBitmap and OffscreenCanvas exist in browsers
// and workers but not under Node/happy-dom, so this file is verified by the
// browser E2E suite (T5/T7), never by Vitest -- the same decision as
// offscreen-codec.ts and the convertisseur's canvas.ts.

function rasterize(bitmap: ImageBitmap, width: number, height: number): ImageData {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new CompressionError("internal-error", "OffscreenCanvas 2D context unavailable");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

export const offscreenPixelOps: PixelOps = {
  async decodeNative(data, sourceMime) {
    // "from-image" applies the EXIF orientation at decode time, so the pixels
    // handed to the WASM encoders are already upright (spec default, but
    // explicit here because the whole orientation guarantee rests on it).
    const bitmap = await createImageBitmap(new Blob([data], { type: sourceMime }), {
      imageOrientation: "from-image",
    });
    try {
      return rasterize(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  },
  async resize(image, width, height) {
    const bitmap = await createImageBitmap(image);
    try {
      return rasterize(bitmap, width, height);
    } finally {
      bitmap.close();
    }
  },
};
