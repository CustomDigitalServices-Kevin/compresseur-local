import { describe, expect, it } from "vitest";
import { createInitialMatrix, estimateAll, SAMPLE_THRESHOLD } from "./estimator";
import type { EstimateRunInput } from "./estimator";
import { PROFILES } from "./profiles";
import type { CompressionLevel, CompressionResult } from "./types";

function resultOf(bytesAfter: number): CompressionResult {
  return {
    bytesBefore: 1000,
    bytesAfter,
    gainPercent: ((1000 - bytesAfter) / 1000) * 100,
    blob: new Blob([new Uint8Array(bytesAfter)]),
    isEstimate: false,
    sampled: false,
  };
}

function smallFile(size: number): File {
  return new File([new Uint8Array(Math.min(size, 8))], "x.png", { type: "image/png" });
}

describe("estimateAll", () => {
  it("starts with every level pending", () => {
    expect(createInitialMatrix()).toEqual({
      light: "pending",
      balanced: "pending",
      maximum: "pending",
    });
  });

  it("fills the matrix and reports each level progressively with the right profile", async () => {
    const seen: EstimateRunInput[] = [];
    const done: CompressionLevel[] = [];
    const byLevel: Record<CompressionLevel, number> = { light: 300, balanced: 200, maximum: 100 };

    const matrix = await estimateAll(smallFile(1024), {
      run: (input) => {
        seen.push(input);
        return Promise.resolve(resultOf(byLevel[input.level]));
      },
      onLevelDone: (level) => {
        done.push(level);
      },
    });

    expect(matrix.light).toMatchObject({ bytesAfter: 300 });
    expect(matrix.balanced).toMatchObject({ bytesAfter: 200 });
    expect(matrix.maximum).toMatchObject({ bytesAfter: 100 });
    expect(done.sort()).toEqual(["balanced", "light", "maximum"]);
    for (const input of seen) {
      expect(input.profile).toBe(PROFILES[input.level]);
      expect(input.allowSampling).toBe(false);
    }
  });

  it("marks a failing level as error without hiding the others", async () => {
    const matrix = await estimateAll(smallFile(1024), {
      run: (input) =>
        input.level === "balanced"
          ? Promise.reject(new Error("boom"))
          : Promise.resolve(resultOf(100)),
    });
    expect(matrix.balanced).toBe("error");
    expect(matrix.light).toMatchObject({ bytesAfter: 100 });
    expect(matrix.maximum).toMatchObject({ bytesAfter: 100 });
  });

  it("does not allow sampling under the threshold", async () => {
    const flags: boolean[] = [];
    await estimateAll(smallFile(1024), {
      run: (input) => {
        flags.push(input.allowSampling);
        return Promise.resolve(resultOf(100));
      },
    });
    expect(flags).toHaveLength(3);
    expect(flags.every((flag) => !flag)).toBe(true);
    expect(SAMPLE_THRESHOLD).toBe(50 * 1024 * 1024);
  });

  it("allows sampling once the file exceeds the (overridable) threshold", async () => {
    const flags: boolean[] = [];
    await estimateAll(smallFile(1024), {
      sampleThreshold: 4,
      run: (input) => {
        flags.push(input.allowSampling);
        return Promise.resolve(resultOf(100));
      },
    });
    expect(flags).toHaveLength(3);
    expect(flags.every((flag) => flag)).toBe(true);
  });
});
