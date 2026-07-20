import { PROFILES } from "../core/profiles";
import { CompressionError, EngineNotRegisteredError } from "../core/types";
import type {
  CompressionErrorCode,
  CompressionLevel,
  CompressionProfile,
  ConvertFormat,
  EstimateMatrix,
} from "../core/types";
import type { DetectedType } from "../core/detect";

/**
 * Advanced settings. `null` means "keep the preset value of the chosen level";
 * a concrete value overrides that field on every level's derived profile.
 */
export interface AdvancedOverrides {
  imageQuality: number | null;
  maxDimension: number | null;
  convertFormat: ConvertFormat | null;
}

export const DEFAULT_OVERRIDES: AdvancedOverrides = {
  imageQuality: null,
  maxDimension: null,
  convertFormat: null,
};

export function isDefaultOverrides(overrides: AdvancedOverrides): boolean {
  return (
    overrides.imageQuality === null &&
    overrides.maxDimension === null &&
    overrides.convertFormat === null
  );
}

/**
 * Derives the profile actually sent to the engines: the level's preset with
 * each non-null advanced field overriding it. Built conditionally because the
 * optional fields must stay absent (not undefined) under
 * exactOptionalPropertyTypes.
 */
export function buildProfile(
  level: CompressionLevel,
  overrides: AdvancedOverrides,
): CompressionProfile {
  const base = PROFILES[level];
  const profile: CompressionProfile = {
    level,
    imageQuality: overrides.imageQuality ?? base.imageQuality,
  };
  const maxDimension = overrides.maxDimension ?? base.maxDimension;
  if (maxDimension !== undefined) {
    profile.maxDimension = maxDimension;
  }
  const convertFormat = overrides.convertFormat ?? base.convertFormat;
  if (convertFormat !== undefined) {
    profile.convertFormat = convertFormat;
  }
  return profile;
}

export type QueueItemStatus = "estimating" | "ready" | "compressing" | "done" | "error";

export interface QueueItem {
  id: string;
  file: File;
  /** Magic-byte detection result; null means the file is not compressible here. */
  detected: DetectedType | null;
  matrix: EstimateMatrix;
  selectedLevel: CompressionLevel;
  status: QueueItemStatus;
  /** Present when status is "error". */
  errorCode: CompressionErrorCode | null;
}

/** Maps any failure raised by the compression pipeline to a stable error code. */
export function errorCodeOf(error: unknown): CompressionErrorCode {
  if (error instanceof EngineNotRegisteredError) return error.code;
  if (error instanceof CompressionError) return error.code;
  return "internal-error";
}
