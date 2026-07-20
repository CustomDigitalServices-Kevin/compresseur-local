import type { CompressionLevel, CompressionProfile } from "../../core/types";

// Pure decision helpers for the PDF engine: per-level pixel caps for embedded
// raster images and the quality mapping. Kept free of pdf-lib/pdfjs so they are
// trivially unit-testable.
//
// DPI rationale (T3 spec: "150 DPI equivalent" balanced, "~110 DPI" maximum):
// scanned pages overwhelmingly embed one full-page image, so the DPI target is
// expressed as a cap on the longest image side for an A4 page (8.27 x 11.69
// inches): 150 DPI -> 11.69 * 150 ~= 1754 px, 110 DPI -> 11.69 * 110 ~= 1287 px
// (same ballpark as pdfcomprezzor's 1240x1754). v1 deliberately does NOT
// compute the true painted DPI from page transform matrices: that would need
// the pdfjs operator list per page and a name->ref mapping back to pdf-lib,
// for marginal benefit on the scanned-document target.

/** Longest-side pixel cap applied to embedded images, per level. */
export const PDF_DIMENSION_CAPS: Record<CompressionLevel, number | undefined> = {
  // Light keeps full resolution: structural pass + JPEG re-encode only.
  light: undefined,
  // ~150 DPI equivalent on A4.
  balanced: 1754,
  // ~110 DPI equivalent on A4.
  maximum: 1287,
};

/**
 * Effective longest-side cap for a profile: the PDF per-level cap, further
 * tightened by an explicit profile.maxDimension (advanced settings) when that
 * is stricter. The default presets' maxDimension (2560/1920) targets standalone
 * images and is looser than the PDF caps, so presets resolve to the PDF caps.
 */
export function pdfMaxDimension(profile: CompressionProfile): number | undefined {
  const cap = PDF_DIMENSION_CAPS[profile.level];
  if (profile.maxDimension === undefined) return cap;
  if (cap === undefined) return profile.maxDimension;
  return Math.min(cap, profile.maxDimension);
}
