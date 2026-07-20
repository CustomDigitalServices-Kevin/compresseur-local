import { describe, expect, it } from "vitest";
import { createImageEngine } from "./canvas-engine";
import type { EncodePlan, RasterCodec, SourceDimensions } from "./raster-codec";
import type { CompressionProfile } from "../../core/types";
import { computeGain, extrapolateByArea } from "./plan";

// A deterministic stand-in for the pixel codec: it models a real encoder well
// enough to test the ENGINE's orchestration (resize decision, quality mapping,
// gain math, sampling extrapolation) without pixels. happy-dom cannot encode
// (getContext('2d') is null, convertToBlob returns 0 bytes), so the pixel-level
// "PNG really becomes a smaller file" guarantee is proven by the browser E2E
// suite (T5), exactly as the convertisseur does for its canvas.ts.
function fakeCodec(
  source: SourceDimensions,
  bytesPerPixel = 0.1,
): {
  codec: RasterCodec;
  plans: EncodePlan[];
} {
  const plans: EncodePlan[] = [];
  const codec: RasterCodec = {
    reencode(_data, _mime, planFor) {
      const plan = planFor(source);
      plans.push(plan);
      const area = plan.targetWidth * plan.targetHeight;
      const quality = plan.quality ?? 1;
      const size = Math.max(1, Math.round(area * quality * bytesPerPixel));
      return Promise.resolve(new Blob([new Uint8Array(size)], { type: plan.mimeType }));
    },
  };
  return { codec, plans };
}

function fileOf(sizeBytes: number, name: string, type: string): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

const maximum: CompressionProfile = { level: "maximum", imageQuality: 55, maxDimension: 1920 };
const light: CompressionProfile = { level: "light", imageQuality: 85 };

describe("image engine (compress)", () => {
  it("really shrinks a source file and reports the gain", async () => {
    const { codec, plans } = fakeCodec({ width: 800, height: 600 });
    const engine = createImageEngine({ codec });
    const result = await engine.compress(fileOf(200_000, "photo.jpg", "image/jpeg"), maximum);

    expect(result.isEstimate).toBe(false);
    expect(result.sampled).toBe(false);
    expect(result.bytesBefore).toBe(200_000);
    expect(result.bytesAfter).toBeLessThan(result.bytesBefore);
    expect(result.bytesAfter).toBe(Math.round(800 * 600 * 0.55 * 0.1));
    expect(result.gainPercent).toBeCloseTo(computeGain(200_000, result.bytesAfter));
    expect(plans[0]?.mimeType).toBe("image/jpeg");
    expect(plans[0]?.quality).toBeCloseTo(0.55);
    expect(plans[0]).toMatchObject({ targetWidth: 800, targetHeight: 600 });
  });

  it("produces a smaller output at maximum than at light for the same source", async () => {
    const source = { width: 800, height: 600 };
    const strong = await createImageEngine({ codec: fakeCodec(source).codec }).compress(
      fileOf(200_000, "photo.jpg", "image/jpeg"),
      maximum,
    );
    const gentle = await createImageEngine({ codec: fakeCodec(source).codec }).compress(
      fileOf(200_000, "photo.jpg", "image/jpeg"),
      light,
    );
    expect(strong.bytesAfter).toBeLessThan(gentle.bytesAfter);
  });

  it("applies the maxDimension cap when the source is larger", async () => {
    const { codec, plans } = fakeCodec({ width: 800, height: 600 });
    const engine = createImageEngine({ codec });
    await engine.compress(fileOf(200_000, "photo.jpg", "image/jpeg"), {
      level: "maximum",
      imageQuality: 55,
      maxDimension: 400,
    });
    expect(plans[0]).toMatchObject({ targetWidth: 400, targetHeight: 300 });
  });

  it("re-encodes to the requested convertFormat", async () => {
    const { codec, plans } = fakeCodec({ width: 100, height: 100 });
    const engine = createImageEngine({ codec });
    await engine.compress(fileOf(50_000, "icon.png", "image/png"), {
      level: "balanced",
      imageQuality: 75,
      convertFormat: "webp",
    });
    expect(plans[0]?.mimeType).toBe("image/webp");
  });

  it("plans a lossless png output (no quality) for a png source at light", async () => {
    const { codec, plans } = fakeCodec({ width: 100, height: 100 });
    const engine = createImageEngine({ codec });
    await engine.compress(fileOf(50_000, "icon.png", "image/png"), light);
    expect(plans[0]?.mimeType).toBe("image/png");
    expect(plans[0]?.quality).toBeUndefined();
  });

  it("plans a lossy webp output for a png source at the stronger levels", async () => {
    const { codec, plans } = fakeCodec({ width: 100, height: 100 });
    const engine = createImageEngine({ codec });
    await engine.compress(fileOf(50_000, "icon.png", "image/png"), {
      level: "balanced",
      imageQuality: 75,
      maxDimension: 2560,
    });
    expect(plans[0]?.mimeType).toBe("image/webp");
    expect(plans[0]?.quality).toBeCloseTo(0.75);
  });
});

describe("image engine (estimate)", () => {
  it("returns an exact result for files under the threshold", async () => {
    const { codec } = fakeCodec({ width: 800, height: 600 });
    const engine = createImageEngine({ codec });
    const result = await engine.estimate?.(fileOf(200_000, "photo.jpg", "image/jpeg"), maximum);
    expect(result?.isEstimate).toBe(false);
    expect(result?.sampled).toBe(false);
  });

  it("samples a down-scaled copy and extrapolates by area for large files", async () => {
    const source = { width: 4000, height: 3000 };
    const { codec } = fakeCodec(source);
    const engine = createImageEngine({ codec, sampleThreshold: 10 });
    const result = await engine.estimate?.(fileOf(300_000, "huge.jpg", "image/jpeg"), maximum);

    expect(result?.isEstimate).toBe(true);
    expect(result?.sampled).toBe(true);
    // sample capped to 1000px -> 1000x750 (area 750000), q0.55 -> 41250 bytes.
    const sampleAfter = Math.round(1000 * 750 * 0.55 * 0.1);
    expect(result?.blob.size).toBe(sampleAfter);
    // extrapolated to the real target (1920x1440, area 2764800).
    const expectedFull = extrapolateByArea(sampleAfter, 1000 * 750, 1920 * 1440);
    expect(result?.bytesAfter).toBe(expectedFull);
    expect(result?.bytesBefore).toBe(300_000);
    expect(result?.gainPercent).toBeCloseTo(computeGain(300_000, expectedFull));
  });
});
