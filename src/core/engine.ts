import type { CompressionProfile, CompressionResult } from "./types";

/**
 * Contract implemented by each family engine (image, pdf, office). Engines run
 * inside the compression worker only -- they must never be imported from
 * main-thread code, so their WASM payloads stay out of the initial bundle.
 */
export interface CompressionEngine {
  /** Compresses the whole file for real: isEstimate === false, blob.size === bytesAfter. */
  compress(file: File, profile: CompressionProfile): Promise<CompressionResult>;
  /**
   * Optional fast estimate. Small inputs behave like compress(); large inputs
   * MAY compress a down-scaled sample and extrapolate (isEstimate/sampled true).
   * When absent, the estimator falls back to compress().
   */
  estimate?(file: File, profile: CompressionProfile): Promise<CompressionResult>;
}
