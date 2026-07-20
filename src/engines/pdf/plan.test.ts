import { describe, expect, it } from "vitest";
import { PDF_DIMENSION_CAPS, pdfMaxDimension } from "./plan";
import { PROFILES } from "../../core/profiles";

describe("PDF_DIMENSION_CAPS", () => {
  it("keeps full resolution at light", () => {
    expect(PDF_DIMENSION_CAPS.light).toBeUndefined();
  });

  it("caps balanced at ~150 DPI equivalent (A4 longest side)", () => {
    expect(PDF_DIMENSION_CAPS.balanced).toBe(1754);
  });

  it("caps maximum at ~110 DPI equivalent (A4 longest side)", () => {
    expect(PDF_DIMENSION_CAPS.maximum).toBe(1287);
  });
});

describe("pdfMaxDimension", () => {
  it("resolves the default presets to the PDF caps", () => {
    // Preset maxDimension (2560/1920) targets standalone images and is looser
    // than the PDF caps, so the PDF caps win for balanced/maximum.
    expect(pdfMaxDimension(PROFILES.light)).toBeUndefined();
    expect(pdfMaxDimension(PROFILES.balanced)).toBe(1754);
    expect(pdfMaxDimension(PROFILES.maximum)).toBe(1287);
  });

  it("lets a stricter advanced maxDimension tighten the cap", () => {
    expect(
      pdfMaxDimension({ level: "maximum", imageQuality: 55, maxDimension: 800 }),
    ).toBe(800);
    expect(
      pdfMaxDimension({ level: "light", imageQuality: 85, maxDimension: 800 }),
    ).toBe(800);
  });

  it("ignores a looser advanced maxDimension", () => {
    expect(
      pdfMaxDimension({ level: "balanced", imageQuality: 75, maxDimension: 4000 }),
    ).toBe(1754);
  });

  it("returns undefined when neither the level nor the profile caps", () => {
    expect(pdfMaxDimension({ level: "light", imageQuality: 85 })).toBeUndefined();
  });
});
