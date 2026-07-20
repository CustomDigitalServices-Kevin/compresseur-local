// Domain types shared by the compression core, the family engines (T2-T4) and
// the UI (T5). Keep this file dependency-free: it is imported by workers and by
// the main thread alike.

/** The three user-facing presets. Advanced settings tweak a derived profile. */
export type CompressionLevel = "light" | "balanced" | "maximum";

/** Ordered from lightest to strongest, for iterating the estimate matrix. */
export const COMPRESSION_LEVELS: readonly CompressionLevel[] = [
  "light",
  "balanced",
  "maximum",
] as const;

/** Image output format an engine may re-encode to (advanced "convert" option). */
export type ConvertFormat = "webp" | "avif" | "jpeg";

export interface CompressionProfile {
  level: CompressionLevel;
  /** 1..100 quality for lossy image encoders (maps to the codec's 0..1). */
  imageQuality: number;
  /** If set, the longest image side is capped to this many pixels (never upscaled). */
  maxDimension?: number;
  /** If set, images are re-encoded to this format instead of keeping their own. */
  convertFormat?: ConvertFormat;
}

/** The three families the registry routes to a lazily-loaded engine. */
export type CompressionFamily = "image" | "pdf" | "office";

export type CompressionJobStatus =
  "pending" | "estimating" | "ready" | "compressing" | "done" | "error";

export interface CompressionJob {
  id: string;
  file: File;
  family: CompressionFamily;
  status: CompressionJobStatus;
  /** Present only when status is "error"; a stable error code (see CompressionErrorCode). */
  error?: CompressionErrorCode;
}

export interface CompressionResult {
  bytesBefore: number;
  bytesAfter: number;
  /** (bytesBefore - bytesAfter) / bytesBefore * 100, clamped to >= 0. */
  gainPercent: number;
  /**
   * The compressed bytes. For a real compression (isEstimate false) this is the
   * full output and blob.size === bytesAfter. For a sampled estimate
   * (sampled true) this is the compressed SAMPLE, a representative preview whose
   * size is smaller than the extrapolated bytesAfter -- the full output is
   * produced by a later compress() call at download time.
   */
  blob: Blob;
  /** True when bytesAfter is extrapolated rather than measured on the whole file. */
  isEstimate: boolean;
  /** True when the result came from compressing a down-scaled sample. */
  sampled: boolean;
}

/** Per-level estimate state, filled progressively as each level completes. */
export type EstimateMatrix = Record<CompressionLevel, CompressionResult | "pending" | "error">;

export type CompressionErrorCode =
  | "unsupported-family"
  | "engine-not-registered"
  | "corrupted-file"
  | "password-protected"
  | "file-too-large"
  | "cancelled"
  | "internal-error";

/** Thrown by the registry when a detected family has no engine registered yet. */
export class EngineNotRegisteredError extends Error {
  readonly code = "engine-not-registered" as const;
  readonly family: CompressionFamily;

  constructor(family: CompressionFamily) {
    super(`No compression engine registered for family "${family}"`);
    this.name = "EngineNotRegisteredError";
    this.family = family;
  }
}

/** Thrown by engines to carry a stable, localizable error code to the UI. */
export class CompressionError extends Error {
  readonly code: CompressionErrorCode;

  constructor(code: CompressionErrorCode, detail: string) {
    super(detail);
    this.name = "CompressionError";
    this.code = code;
  }
}

// --- Worker wire protocol -------------------------------------------------
// Blob is structured-cloneable, but we transfer raw ArrayBuffers instead so the
// large image payloads move without a copy. The bridge reconstructs Blob/File
// on each side (see worker-bridge.ts and compression.worker.ts).

export interface CompressionResultWire {
  bytesBefore: number;
  bytesAfter: number;
  gainPercent: number;
  /** Bytes of `blob`; reconstructed into a Blob with `mimeType` on the main thread. */
  data: ArrayBuffer;
  mimeType: string;
  isEstimate: boolean;
  sampled: boolean;
}

export type WorkerInbound = {
  kind: "compress";
  jobId: string;
  profile: CompressionProfile;
  /** When true the engine may sample+extrapolate large inputs (estimate path). */
  allowSampling: boolean;
  fileName: string;
  fileType: string;
  data: ArrayBuffer;
};

export type WorkerOutbound =
  | { kind: "result"; jobId: string; result: CompressionResultWire }
  | { kind: "error"; jobId: string; code: CompressionErrorCode; detail: string };
