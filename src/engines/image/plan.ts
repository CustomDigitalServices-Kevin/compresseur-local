import type { CompressionLevel, ConvertFormat } from "../../core/types";
import type { SourceDimensions } from "./raster-codec";

// Pure decision helpers for the image engine: quality mapping, resize math,
// output-format selection and gain/extrapolation arithmetic. Kept free of any
// canvas/DOM dependency so they are fully unit-testable under Vitest, while the
// actual pixel work stays behind the RasterCodec seam.

export type ImageSourceFormat = "jpeg" | "png" | "webp" | "avif" | "other";

const MIME_BY_CONVERT: Record<ConvertFormat, string> = {
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
};

/** Clamps the 1..100 UI quality into range. */
export function clampQuality(imageQuality: number): number {
  if (Number.isNaN(imageQuality)) return 1;
  return Math.min(100, Math.max(1, Math.round(imageQuality)));
}

/** Maps the 1..100 UI quality to the codec's 0..1 scale. */
export function qualityToUnit(imageQuality: number): number {
  return clampQuality(imageQuality) / 100;
}

/** Identifies the source format from its MIME type, falling back to the extension. */
export function imageSourceFormat(mime: string, fileName: string): ImageSourceFormat {
  const m = mime.toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "jpeg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/avif") return "avif";
  const dot = fileName.lastIndexOf(".");
  const ext = dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  if (ext === "png") return "png";
  if (ext === "webp") return "webp";
  if (ext === "avif") return "avif";
  return "other";
}

/**
 * Picks the output MIME type. An explicit convertFormat always wins. Without
 * one, the engine re-encodes into the SOURCE format (jpeg -> jpeg, webp ->
 * webp, avif -> avif) with one documented exception, the PNG mapping:
 *
 *   - png at "light"               -> image/png  (lossless Oxipng optimization:
 *     pixels untouched, only the encoding shrinks)
 *   - png at "balanced"/"maximum"  -> image/webp (lossy WebP, preserves alpha;
 *     a lossy re-encode of a PNG back INTO png would usually grow the file, so
 *     the stronger levels switch container to actually gain bytes)
 *
 * Unknown raster formats also become lossy WebP, the alpha-safe default.
 */
export function selectOutputMime(
  source: ImageSourceFormat,
  convert: ConvertFormat | undefined,
  level: CompressionLevel,
): string {
  if (convert !== undefined) return MIME_BY_CONVERT[convert];
  if (source === "jpeg") return "image/jpeg";
  if (source === "webp") return "image/webp";
  if (source === "avif") return "image/avif";
  if (source === "png") return level === "light" ? "image/png" : "image/webp";
  return "image/webp";
}

/**
 * Caps the longest side to maxDimension, preserving aspect ratio and never
 * upscaling. Returns the source dimensions unchanged when no cap applies.
 */
export function computeTargetDimensions(
  dims: SourceDimensions,
  maxDimension: number | undefined,
): SourceDimensions {
  const longest = Math.max(dims.width, dims.height);
  if (maxDimension === undefined || maxDimension <= 0 || longest <= maxDimension) {
    return { width: dims.width, height: dims.height };
  }
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(dims.width * scale)),
    height: Math.max(1, Math.round(dims.height * scale)),
  };
}

/** Percentage size reduction, clamped to >= 0 (a bigger output reports 0% gain). */
export function computeGain(bytesBefore: number, bytesAfter: number): number {
  if (bytesBefore <= 0) return 0;
  const gain = ((bytesBefore - bytesAfter) / bytesBefore) * 100;
  return gain < 0 ? 0 : gain;
}

/**
 * Extrapolates the full-file compressed size from a compressed sample, assuming
 * a roughly constant bytes-per-pixel at a fixed quality: the encoded size
 * scales with pixel area. Guards against a zero-area sample.
 */
export function extrapolateByArea(
  sampleAfterBytes: number,
  sampleArea: number,
  targetArea: number,
): number {
  if (sampleArea <= 0) return sampleAfterBytes;
  return Math.round((sampleAfterBytes * targetArea) / sampleArea);
}
