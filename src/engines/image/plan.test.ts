import { describe, expect, it } from "vitest";
import {
  clampQuality,
  computeGain,
  computeTargetDimensions,
  extrapolateByArea,
  imageSourceFormat,
  qualityToUnit,
  selectOutputMime,
} from "./plan";

describe("clampQuality / qualityToUnit", () => {
  it("clamps into 1..100 and rounds", () => {
    expect(clampQuality(0)).toBe(1);
    expect(clampQuality(150)).toBe(100);
    expect(clampQuality(54.6)).toBe(55);
    expect(clampQuality(Number.NaN)).toBe(1);
  });

  it("maps 1..100 to the codec's 0..1 scale", () => {
    expect(qualityToUnit(55)).toBeCloseTo(0.55);
    expect(qualityToUnit(100)).toBe(1);
  });
});

describe("imageSourceFormat", () => {
  it("reads the MIME type first", () => {
    expect(imageSourceFormat("image/jpeg", "x.bin")).toBe("jpeg");
    expect(imageSourceFormat("image/png", "x.bin")).toBe("png");
    expect(imageSourceFormat("image/webp", "x.bin")).toBe("webp");
    expect(imageSourceFormat("image/avif", "x.bin")).toBe("avif");
  });

  it("falls back to the extension when the MIME is missing", () => {
    expect(imageSourceFormat("", "photo.JPG")).toBe("jpeg");
    expect(imageSourceFormat("", "icon.png")).toBe("png");
    expect(imageSourceFormat("", "mystery.dat")).toBe("other");
  });
});

describe("selectOutputMime", () => {
  it("honors an explicit convertFormat above everything else", () => {
    expect(selectOutputMime("png", "jpeg", "light")).toBe("image/jpeg");
    expect(selectOutputMime("jpeg", "webp", "balanced")).toBe("image/webp");
    expect(selectOutputMime("png", "avif", "maximum")).toBe("image/avif");
  });

  it("re-encodes jpeg, webp and avif into their own format at every level", () => {
    for (const level of ["light", "balanced", "maximum"] as const) {
      expect(selectOutputMime("jpeg", undefined, level)).toBe("image/jpeg");
      expect(selectOutputMime("webp", undefined, level)).toBe("image/webp");
      expect(selectOutputMime("avif", undefined, level)).toBe("image/avif");
    }
  });

  it("maps png to lossless png at light and to lossy webp at stronger levels", () => {
    expect(selectOutputMime("png", undefined, "light")).toBe("image/png");
    expect(selectOutputMime("png", undefined, "balanced")).toBe("image/webp");
    expect(selectOutputMime("png", undefined, "maximum")).toBe("image/webp");
  });

  it("re-encodes unknown formats to lossy webp at every level", () => {
    expect(selectOutputMime("other", undefined, "light")).toBe("image/webp");
    expect(selectOutputMime("other", undefined, "balanced")).toBe("image/webp");
    expect(selectOutputMime("other", undefined, "maximum")).toBe("image/webp");
  });
});

describe("computeTargetDimensions", () => {
  it("returns source dimensions when no cap applies", () => {
    expect(computeTargetDimensions({ width: 800, height: 600 }, undefined)).toEqual({
      width: 800,
      height: 600,
    });
    expect(computeTargetDimensions({ width: 800, height: 600 }, 2560)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("never upscales", () => {
    expect(computeTargetDimensions({ width: 400, height: 300 }, 4000)).toEqual({
      width: 400,
      height: 300,
    });
  });

  it("caps the longest side and preserves aspect ratio", () => {
    expect(computeTargetDimensions({ width: 4000, height: 3000 }, 1920)).toEqual({
      width: 1920,
      height: 1440,
    });
  });

  it("keeps at least 1px on the short side", () => {
    const result = computeTargetDimensions({ width: 10000, height: 5 }, 1000);
    expect(result.width).toBe(1000);
    expect(result.height).toBe(1);
  });
});

describe("computeGain", () => {
  it("reports the percentage reduction", () => {
    expect(computeGain(1000, 250)).toBe(75);
  });

  it("clamps a size increase to 0%", () => {
    expect(computeGain(100, 180)).toBe(0);
  });

  it("returns 0 when the original size is unknown", () => {
    expect(computeGain(0, 50)).toBe(0);
  });
});

describe("extrapolateByArea", () => {
  it("scales the sample size by the target/sample area ratio", () => {
    // sample 41250 bytes at 750000 px -> 2764800 px target
    expect(extrapolateByArea(41250, 750000, 2764800)).toBe(152064);
  });

  it("guards against a zero-area sample", () => {
    expect(extrapolateByArea(500, 0, 1000)).toBe(500);
  });
});
