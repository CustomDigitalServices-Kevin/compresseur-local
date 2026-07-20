export interface SourceDimensions {
  width: number;
  height: number;
}

export interface EncodePlan {
  targetWidth: number;
  targetHeight: number;
  mimeType: string;
  /** 0..1 quality for lossy targets (jpeg/webp/avif); omit for lossless. */
  quality?: number;
}

/**
 * Low-level raster primitive: decode once, let the caller decide the output
 * plan from the real source dimensions, then draw + re-encode. All the decision
 * logic lives in the caller's `planFor` (pure, unit-tested); this interface is
 * the single seam that touches actual pixels, so the engine can be tested with
 * a fake codec while production uses OffscreenCanvas.
 */
export interface RasterCodec {
  reencode(
    data: ArrayBuffer,
    sourceMime: string,
    planFor: (dims: SourceDimensions) => EncodePlan,
  ): Promise<Blob>;
}
