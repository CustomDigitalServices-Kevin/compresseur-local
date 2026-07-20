import type { CompressionEngine } from "../../core/engine";
import type { CompressionProfile, CompressionResult } from "../../core/types";
import type { EncodePlan, RasterCodec, SourceDimensions } from "./raster-codec";
import {
  computeGain,
  computeTargetDimensions,
  extrapolateByArea,
  imageSourceFormat,
  qualityToUnit,
  selectOutputMime,
} from "./plan";

// Baseline image engine for T1. It compresses for real via a RasterCodec
// (native OffscreenCanvas in production): decode, optional resize, re-encode to
// a lossy target at the profile quality. It is NOT a stub -- it produces a
// genuinely smaller file -- but it is deliberately minimal: T2 replaces it with
// the @jsquash codecs (MozJPEG / OxiPNG / lossless WebP / AVIF) for better
// ratios and true PNG-lossless support. The RasterCodec seam is what T2 swaps.

/** Above this size, estimate() samples a down-scaled copy and extrapolates. */
export const DEFAULT_SAMPLE_THRESHOLD = 50 * 1024 * 1024;
/** Longest side of the sample compressed during a large-file estimate. */
export const SAMPLE_MAX_DIMENSION = 1000;

export interface ImageEngineDeps {
  codec: RasterCodec;
  /** Overridable so tests can trigger the sampling path on small fixtures. */
  sampleThreshold?: number;
}

function sourceMimeOf(file: File): string {
  if (file.type !== "") return file.type;
  // Fall back to a plausible MIME so createImageBitmap gets a hint; the decoder
  // sniffs the real format from the bytes regardless.
  return "application/octet-stream";
}

function buildPlan(
  file: File,
  profile: CompressionProfile,
  maxDimension: number | undefined,
  captured: { dims: SourceDimensions | null },
): (dims: SourceDimensions) => EncodePlan {
  const mimeType = selectOutputMime(imageSourceFormat(file.type, file.name), profile.convertFormat);
  const quality = qualityToUnit(profile.imageQuality);
  return (dims) => {
    captured.dims = dims;
    const target = computeTargetDimensions(dims, maxDimension);
    return { targetWidth: target.width, targetHeight: target.height, mimeType, quality };
  };
}

async function compressReal(
  codec: RasterCodec,
  file: File,
  profile: CompressionProfile,
): Promise<CompressionResult> {
  const data = await file.arrayBuffer();
  const captured: { dims: SourceDimensions | null } = { dims: null };
  const blob = await codec.reencode(
    data,
    sourceMimeOf(file),
    buildPlan(file, profile, profile.maxDimension, captured),
  );
  const bytesBefore = file.size;
  const bytesAfter = blob.size;
  return {
    bytesBefore,
    bytesAfter,
    gainPercent: computeGain(bytesBefore, bytesAfter),
    blob,
    isEstimate: false,
    sampled: false,
  };
}

async function estimateSampled(
  codec: RasterCodec,
  file: File,
  profile: CompressionProfile,
): Promise<CompressionResult> {
  const data = await file.arrayBuffer();
  const captured: { dims: SourceDimensions | null } = { dims: null };
  // Compress a small sample: cap the sample to SAMPLE_MAX_DIMENSION, but never
  // below any tighter maxDimension the profile already asks for.
  const sampleCap =
    profile.maxDimension === undefined
      ? SAMPLE_MAX_DIMENSION
      : Math.min(SAMPLE_MAX_DIMENSION, profile.maxDimension);
  const sampleBlob = await codec.reencode(
    data,
    sourceMimeOf(file),
    buildPlan(file, profile, sampleCap, captured),
  );

  const source = captured.dims;
  const bytesBefore = file.size;
  if (source === null) {
    // The codec never reported dimensions (should not happen); fall back to the
    // measured sample size as a conservative estimate rather than inventing one.
    return {
      bytesBefore,
      bytesAfter: sampleBlob.size,
      gainPercent: computeGain(bytesBefore, sampleBlob.size),
      blob: sampleBlob,
      isEstimate: true,
      sampled: true,
    };
  }

  const sampleDims = computeTargetDimensions(source, sampleCap);
  const targetDims = computeTargetDimensions(source, profile.maxDimension);
  const bytesAfter = extrapolateByArea(
    sampleBlob.size,
    sampleDims.width * sampleDims.height,
    targetDims.width * targetDims.height,
  );
  return {
    bytesBefore,
    bytesAfter,
    gainPercent: computeGain(bytesBefore, bytesAfter),
    blob: sampleBlob,
    isEstimate: true,
    sampled: true,
  };
}

export function createImageEngine(deps: ImageEngineDeps): CompressionEngine {
  const threshold = deps.sampleThreshold ?? DEFAULT_SAMPLE_THRESHOLD;
  return {
    compress: (file, profile) => compressReal(deps.codec, file, profile),
    estimate: (file, profile) =>
      file.size > threshold
        ? estimateSampled(deps.codec, file, profile)
        : compressReal(deps.codec, file, profile),
  };
}
