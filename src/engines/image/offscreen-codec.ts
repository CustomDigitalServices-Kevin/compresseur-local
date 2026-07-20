import { CompressionError } from "../../core/types";
import type { EncodePlan, RasterCodec, SourceDimensions } from "./raster-codec";

// Production RasterCodec. createImageBitmap decodes any browser-native raster
// (png/jpeg/webp/avif), OffscreenCanvas.convertToBlob re-encodes with an
// optional 0..1 quality. Neither API exists under Node/happy-dom, so this file
// is verified by the browser E2E suite (T5), never by Vitest -- the same
// decision the convertisseur made for its canvas.ts.
export const offscreenCanvasCodec: RasterCodec = {
  async reencode(
    data: ArrayBuffer,
    sourceMime: string,
    planFor: (dims: SourceDimensions) => EncodePlan,
  ): Promise<Blob> {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(new Blob([data], { type: sourceMime }));
    } catch (error) {
      throw new CompressionError("corrupted-file", `Image decode failed: ${String(error)}`);
    }
    try {
      const plan = planFor({ width: bitmap.width, height: bitmap.height });
      const canvas = new OffscreenCanvas(plan.targetWidth, plan.targetHeight);
      const ctx = canvas.getContext("2d");
      if (ctx === null) {
        throw new CompressionError("internal-error", "OffscreenCanvas 2D context unavailable");
      }
      ctx.drawImage(bitmap, 0, 0, plan.targetWidth, plan.targetHeight);
      return await canvas.convertToBlob(
        plan.quality === undefined
          ? { type: plan.mimeType }
          : { type: plan.mimeType, quality: plan.quality },
      );
    } finally {
      bitmap.close();
    }
  },
};
