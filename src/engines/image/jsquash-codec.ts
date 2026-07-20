import { CompressionError } from "../../core/types";
import { detectType } from "../../core/detect";
import type { RasterCodec } from "./raster-codec";
import { clampQuality } from "./plan";
import type { CodecLoaders, ImageDecoder } from "./codec-loaders";

// jSquash-backed RasterCodec: decode (native first, WASM fallback), optional
// resize, then re-encode through the format's WASM encoder. All pixel
// primitives and codec loaders are injected so every branch is unit-testable
// under happy-dom, where the real WASM/canvas APIs do not exist (gotcha D5);
// the real wiring lives in module.ts and is proven by the browser E2E suite.

/**
 * Pixel primitives the codec needs from the platform: OffscreenCanvas-based in
 * production (pixel-ops.ts), plain fakes in tests.
 */
export interface PixelOps {
  /** Decodes via the browser's native decoder, EXIF orientation applied. */
  decodeNative(data: ArrayBuffer, sourceMime: string): Promise<ImageData>;
  /** High-quality resize to exactly width x height. */
  resize(image: ImageData, width: number, height: number): Promise<ImageData>;
}

export interface JsquashCodecDeps {
  loaders: CodecLoaders;
  pixels: PixelOps;
}

type WasmImageFormat = "jpeg" | "png" | "webp" | "avif";

/** Identifies the decodable format from the file's magic bytes, never its name. */
function detectedImageFormat(data: ArrayBuffer): WasmImageFormat | null {
  const detected = detectType("", data);
  if (detected === null || detected.family !== "image") return null;
  const { format } = detected;
  return format === "jpeg" || format === "png" || format === "webp" || format === "avif"
    ? format
    : null;
}

function decoderFor(loaders: CodecLoaders, format: WasmImageFormat): Promise<ImageDecoder> {
  switch (format) {
    case "jpeg":
      return loaders.loadJpeg();
    case "png":
      return loaders.loadPng();
    case "webp":
      return loaders.loadWebp();
    case "avif":
      return loaders.loadAvif();
  }
}

/**
 * Decodes to upright RGBA pixels. The native decoder goes first (fast path,
 * EXIF orientation applied); when it fails -- e.g. AVIF on a browser without
 * an AVIF decoder, or no DOM decoder at all -- the matching WASM decoder takes
 * over based on the file's magic bytes. Only when both paths fail (or nothing
 * matches the signature) does the file count as corrupted.
 */
async function decodePixels(
  deps: JsquashCodecDeps,
  data: ArrayBuffer,
  sourceMime: string,
): Promise<ImageData> {
  let nativeDetail: string;
  try {
    return await deps.pixels.decodeNative(data, sourceMime);
  } catch (error) {
    nativeDetail = error instanceof Error ? error.message : String(error);
  }
  const format = detectedImageFormat(data);
  if (format === null) {
    throw new CompressionError(
      "corrupted-file",
      `Native image decode failed (${nativeDetail}) and the bytes match no supported image signature`,
    );
  }
  // A CodecLoadError from the loader propagates as-is: the fallback layer
  // retries the whole job on the native canvas codec.
  const decoder = await decoderFor(deps.loaders, format);
  try {
    return await decoder.decode(data);
  } catch (error) {
    const wasmDetail = error instanceof Error ? error.message : String(error);
    throw new CompressionError(
      "corrupted-file",
      `Native image decode failed (${nativeDetail}); ${format} WASM decode failed (${wasmDetail})`,
    );
  }
}

async function encodeLossy(
  loaders: CodecLoaders,
  mimeType: string,
  image: ImageData,
  quality: number,
): Promise<ArrayBuffer> {
  switch (mimeType) {
    case "image/jpeg":
      return (await loaders.loadJpeg()).encode(image, quality);
    case "image/webp":
      return (await loaders.loadWebp()).encode(image, quality);
    case "image/avif":
      return (await loaders.loadAvif()).encode(image, quality);
    default:
      throw new CompressionError("internal-error", `Unsupported output format ${mimeType}`);
  }
}

export function createJsquashCodec(deps: JsquashCodecDeps): RasterCodec {
  return {
    async reencode(data, sourceMime, planFor) {
      const image = await decodePixels(deps, data, sourceMime);
      const plan = planFor({ width: image.width, height: image.height });
      const needsResize = plan.targetWidth !== image.width || plan.targetHeight !== image.height;

      // Lossless PNG pass over an untouched PNG source: hand Oxipng the
      // ORIGINAL file bytes so not a single pixel is re-quantized -- only the
      // encoding shrinks.
      if (plan.mimeType === "image/png" && !needsResize && detectedImageFormat(data) === "png") {
        const oxipng = await deps.loaders.loadOxipng();
        return new Blob([await oxipng.optimiseBytes(data)], { type: "image/png" });
      }

      const target = needsResize
        ? await deps.pixels.resize(image, plan.targetWidth, plan.targetHeight)
        : image;

      // Any other png output (a resized lossless pass) re-encodes the raw
      // pixels through Oxipng.
      if (plan.mimeType === "image/png") {
        const oxipng = await deps.loaders.loadOxipng();
        return new Blob([await oxipng.optimiseRaw(target)], { type: "image/png" });
      }

      // Lossy targets: plan.quality is 0..1 (see EncodePlan); the jSquash
      // encoders speak 1..100.
      const quality = clampQuality((plan.quality ?? 1) * 100);
      const encoded = await encodeLossy(deps.loaders, plan.mimeType, target, quality);
      return new Blob([encoded], { type: plan.mimeType });
    },
  };
}
