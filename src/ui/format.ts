import type { CompressionFamily } from "../core/types";
import type { Locale } from "../i18n/messages";

const UNITS: Record<Locale, readonly string[]> = {
  fr: ["o", "Ko", "Mo", "Go"],
  en: ["B", "KB", "MB", "GB"],
};

/** Human-readable file size, locale-aware ("1,2 Mo" in French, "1.2 MB" in English). */
export function formatBytes(bytes: number, locale: Locale): string {
  const units = UNITS[locale];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const digits = index === 0 || value >= 100 ? 0 : 1;
  // No grouping separator: "1000 B" reads better than "1,000 B" for sizes and
  // keeps the label short inside the level tiles.
  const formatted = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(value);
  const unit = units[index] ?? "B";
  return `${formatted} ${unit}`;
}

/** Savings percentage label ("-42 %" in French, "-42%" in English, never negative savings). */
export function formatGain(gainPercent: number, locale: Locale): string {
  const rounded = Math.max(0, Math.round(gainPercent));
  const suffix = locale === "fr" ? " %" : "%";
  return rounded === 0 ? `0${suffix}` : `-${String(rounded)}${suffix}`;
}

const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/**
 * Output file name: the original stem plus a "-min" marker (locale-neutral) so
 * the download never silently overwrites the source file.
 *
 * The extension is derived from the MIME type the engine ACTUALLY produced, not
 * from the request: the image engine re-encodes a PNG to WebP at the balanced
 * and maximum levels (plan.ts selectOutputMime), so keying off the source name
 * shipped WebP bytes named ".png" -- a file some viewers refuse to open (caught
 * by the E2E image spec, 2026-07-20). Non-image families keep their extension:
 * their engines preserve the container.
 */
export function outputFileName(
  originalName: string,
  family: CompressionFamily | null,
  outputMimeType: string,
): string {
  const dot = originalName.lastIndexOf(".");
  const stem = dot <= 0 ? originalName : originalName.slice(0, dot);
  const originalExt = dot <= 0 ? "" : originalName.slice(dot + 1);
  const ext =
    family === "image" ? (IMAGE_EXTENSION_BY_MIME[outputMimeType] ?? originalExt) : originalExt;
  return ext === "" ? `${stem}-min` : `${stem}-min.${ext}`;
}
