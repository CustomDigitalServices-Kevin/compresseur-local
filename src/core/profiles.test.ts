import { describe, expect, it } from "vitest";
import { PROFILES, profileFor } from "./profiles";
import { COMPRESSION_LEVELS } from "./types";

describe("compression profiles", () => {
  it("matches the PRD preset values", () => {
    expect(PROFILES.light).toEqual({ level: "light", imageQuality: 85 });
    expect(PROFILES.balanced).toEqual({ level: "balanced", imageQuality: 75, maxDimension: 2560 });
    expect(PROFILES.maximum).toEqual({ level: "maximum", imageQuality: 55, maxDimension: 1920 });
  });

  it("leaves light without a maxDimension (full resolution)", () => {
    expect(PROFILES.light.maxDimension).toBeUndefined();
  });

  it("each profile's level field matches its key", () => {
    for (const level of COMPRESSION_LEVELS) {
      expect(PROFILES[level].level).toBe(level);
    }
  });

  it("quality decreases from light to maximum", () => {
    expect(PROFILES.light.imageQuality).toBeGreaterThan(PROFILES.balanced.imageQuality);
    expect(PROFILES.balanced.imageQuality).toBeGreaterThan(PROFILES.maximum.imageQuality);
  });

  it("maximum downscales more aggressively than balanced", () => {
    expect(PROFILES.maximum.maxDimension).toBeLessThan(PROFILES.balanced.maxDimension ?? Infinity);
  });

  it("profileFor returns the matching profile", () => {
    expect(profileFor("balanced")).toBe(PROFILES.balanced);
  });
});
