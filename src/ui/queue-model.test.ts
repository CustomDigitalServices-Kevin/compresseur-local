import { describe, expect, it } from "vitest";
import { PROFILES } from "../core/profiles";
import { CompressionError, EngineNotRegisteredError } from "../core/types";
import { buildProfile, DEFAULT_OVERRIDES, errorCodeOf, isDefaultOverrides } from "./queue-model";

describe("buildProfile", () => {
  it("returns the preset values when no override is set", () => {
    expect(buildProfile("balanced", DEFAULT_OVERRIDES)).toEqual({
      level: "balanced",
      imageQuality: PROFILES.balanced.imageQuality,
      maxDimension: PROFILES.balanced.maxDimension,
    });
  });

  it("omits maxDimension entirely when neither preset nor override sets it", () => {
    const profile = buildProfile("light", DEFAULT_OVERRIDES);
    expect("maxDimension" in profile).toBe(false);
    expect("convertFormat" in profile).toBe(false);
  });

  it("lets advanced settings override the preset on every field", () => {
    expect(
      buildProfile("light", { imageQuality: 30, maxDimension: 800, convertFormat: "avif" }),
    ).toEqual({ level: "light", imageQuality: 30, maxDimension: 800, convertFormat: "avif" });
  });

  it("applies overrides per field, keeping the preset for the others", () => {
    const profile = buildProfile("maximum", {
      imageQuality: 90,
      maxDimension: null,
      convertFormat: null,
    });
    expect(profile.imageQuality).toBe(90);
    expect(profile.maxDimension).toBe(PROFILES.maximum.maxDimension);
  });
});

describe("isDefaultOverrides", () => {
  it("detects the untouched state", () => {
    expect(isDefaultOverrides(DEFAULT_OVERRIDES)).toBe(true);
    expect(isDefaultOverrides({ imageQuality: 50, maxDimension: null, convertFormat: null })).toBe(
      false,
    );
  });
});

describe("errorCodeOf", () => {
  it("maps a missing engine to its stable code", () => {
    expect(errorCodeOf(new EngineNotRegisteredError("pdf"))).toBe("engine-not-registered");
  });

  it("passes through an engine error code", () => {
    expect(errorCodeOf(new CompressionError("corrupted-file", "bad header"))).toBe(
      "corrupted-file",
    );
  });

  it("falls back to internal-error for anything else", () => {
    expect(errorCodeOf(new Error("boom"))).toBe("internal-error");
    expect(errorCodeOf("nope")).toBe("internal-error");
  });
});
