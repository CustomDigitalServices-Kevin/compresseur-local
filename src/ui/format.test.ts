import { describe, expect, it } from "vitest";
import { formatBytes, formatGain, outputFileName } from "./format";

describe("formatBytes", () => {
  it("uses French units and separators", () => {
    expect(formatBytes(512, "fr")).toBe("512 o");
    expect(formatBytes(2_500_000, "fr")).toBe("2,4 Mo");
  });

  it("uses English units", () => {
    expect(formatBytes(512, "en")).toBe("512 B");
    expect(formatBytes(2_500_000, "en")).toBe("2.4 MB");
  });

  it("drops decimals for large values inside a unit", () => {
    expect(formatBytes(150 * 1024, "en")).toBe("150 KB");
  });
});

describe("formatGain", () => {
  it("renders a negative-signed percentage per locale", () => {
    expect(formatGain(42.4, "fr")).toBe("-42 %");
    expect(formatGain(42.4, "en")).toBe("-42%");
  });

  it("never renders a negative saving", () => {
    expect(formatGain(-5, "en")).toBe("0%");
    expect(formatGain(0.2, "en")).toBe("0%");
  });
});

describe("outputFileName", () => {
  it("suffixes the stem and keeps the original extension", () => {
    expect(outputFileName("photo.png", "image", null)).toBe("photo-min.png");
    expect(outputFileName("rapport.pdf", "pdf", null)).toBe("rapport-min.pdf");
  });

  it("follows the converted image format, mapping jpeg to jpg", () => {
    expect(outputFileName("photo.png", "image", "webp")).toBe("photo-min.webp");
    expect(outputFileName("photo.png", "image", "jpeg")).toBe("photo-min.jpg");
  });

  it("ignores the image conversion for non-image families", () => {
    expect(outputFileName("note.docx", "office", "webp")).toBe("note-min.docx");
  });

  it("handles names without an extension", () => {
    expect(outputFileName("archive", null, null)).toBe("archive-min");
  });
});
