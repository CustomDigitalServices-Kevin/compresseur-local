import { afterEach, describe, expect, it } from "vitest";
import { detectType, getEngineLoader, hasEngine, registerEngine, resetEngines } from "./registry";
import type { CompressionEngine } from "./engine";
import { EngineNotRegisteredError } from "./types";

const stubEngine: CompressionEngine = {
  compress: () =>
    Promise.resolve({
      bytesBefore: 10,
      bytesAfter: 5,
      gainPercent: 50,
      blob: new Blob([new Uint8Array(5)]),
      isEstimate: false,
      sampled: false,
    }),
};

afterEach(() => {
  resetEngines();
});

describe("engine registry", () => {
  it("registers and retrieves a family loader", async () => {
    registerEngine("image", () => Promise.resolve(stubEngine));
    expect(hasEngine("image")).toBe(true);
    const loader = getEngineLoader("image");
    await expect(loader()).resolves.toBe(stubEngine);
  });

  it("throws EngineNotRegisteredError for an unregistered family", () => {
    expect(hasEngine("pdf")).toBe(false);
    try {
      getEngineLoader("pdf");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(EngineNotRegisteredError);
      expect((error as EngineNotRegisteredError).family).toBe("pdf");
      expect((error as EngineNotRegisteredError).code).toBe("engine-not-registered");
    }
  });

  it("resetEngines clears every registration", () => {
    registerEngine("image", () => Promise.resolve(stubEngine));
    resetEngines();
    expect(hasEngine("image")).toBe(false);
  });

  it("re-exports detectType so callers route by detected family", () => {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    expect(detectType("x.png", new Uint8Array(png).buffer)?.family).toBe("image");
  });
});
