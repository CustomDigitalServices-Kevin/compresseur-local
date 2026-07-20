import type { CompressionFamily, ConvertFormat } from "../core/types";
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

/**
 * Output file name: the original stem plus a "-min" marker (locale-neutral) so
 * the download never silently overwrites the source file. When the advanced
 * settings convert images to another format, the extension follows.
 */
export function outputFileName(
  originalName: string,
  family: CompressionFamily | null,
  convertFormat: ConvertFormat | null,
): string {
  const dot = originalName.lastIndexOf(".");
  const stem = dot <= 0 ? originalName : originalName.slice(0, dot);
  const originalExt = dot <= 0 ? "" : originalName.slice(dot + 1);
  const ext =
    family === "image" && convertFormat !== null
      ? convertFormat === "jpeg"
        ? "jpg"
        : convertFormat
      : originalExt;
  return ext === "" ? `${stem}-min` : `${stem}-min.${ext}`;
}
