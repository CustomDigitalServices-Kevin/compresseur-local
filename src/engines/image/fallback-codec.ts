import { CompressionError } from "../../core/types";
import type { RasterCodec } from "./raster-codec";

/**
 * Wires the jSquash codec in front of the native canvas codec. A corrupted
 * input propagates untouched (the canvas could not decode it either); ANY
 * other primary failure -- codec JS/WASM failed to load (CodecLoadError), or
 * an encoder trapped at runtime -- logs a real warning and retries with the
 * canvas, so the user still gets a compressed file at baseline quality. When
 * both paths fail, the job surfaces a CompressionError carrying BOTH reasons;
 * the fallback is never silent.
 */
export function createFallbackCodec(
  primary: RasterCodec,
  fallback: RasterCodec,
  warn: (message: string) => void,
): RasterCodec {
  return {
    async reencode(data, sourceMime, planFor) {
      let primaryDetail: string;
      try {
        return await primary.reencode(data, sourceMime, planFor);
      } catch (error) {
        if (error instanceof CompressionError && error.code === "corrupted-file") {
          throw error;
        }
        primaryDetail = error instanceof Error ? error.message : String(error);
      }
      warn(
        `[image-engine] jSquash codec failed (${primaryDetail}); falling back to the native canvas codec.`,
      );
      try {
        return await fallback.reencode(data, sourceMime, planFor);
      } catch (fallbackError) {
        if (fallbackError instanceof CompressionError && fallbackError.code === "corrupted-file") {
          throw fallbackError;
        }
        const fallbackDetail =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new CompressionError(
          "internal-error",
          `jSquash codec failed: ${primaryDetail}; canvas fallback failed: ${fallbackDetail}`,
        );
      }
    },
  };
}
