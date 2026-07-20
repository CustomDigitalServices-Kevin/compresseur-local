import type { CompressionLevel, CompressionProfile } from "./types";

// Default presets, one per level. This is the single source of truth for the
// three levels and MUST stay in parity with the mcp-compress server's
// list_compression_profiles tool (same numbers, same names) so the web app and
// the MCP report identical estimates -- when either side changes a number, the
// other has to follow.
//
// AVIF note (advanced convertFormat: "avif"): the AVIF encoder added in T2 is
// forced single-thread (no guaranteed SharedArrayBuffer on the static
// deployment, gotcha D8 convertisseur), so "avif" is heavier at maximum quality.
// The presets below never pick avif by default; it is opt-in via advanced
// settings only.
export const PROFILES: Record<CompressionLevel, CompressionProfile> = {
  // Light: keep full resolution, trim only encoder overhead.
  light: { level: "light", imageQuality: 85 },
  // Balanced: cap to a large-screen dimension, moderate quality.
  balanced: { level: "balanced", imageQuality: 75, maxDimension: 2560 },
  // Maximum: aggressive downscale + low quality for the smallest output.
  maximum: { level: "maximum", imageQuality: 55, maxDimension: 1920 },
};

export function profileFor(level: CompressionLevel): CompressionProfile {
  return PROFILES[level];
}
