import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync } from "fflate";
import { createOfficeEngine, OFFICE_SAMPLE_COUNT } from "./office-engine";
import type { EncodePlan, RasterCodec, SourceDimensions } from "../image/raster-codec";
import type { CompressionProfile } from "../../core/types";
import { CompressionError } from "../../core/types";
import {
  buildOoxml,
  contentPartsOf,
  fakeBinary,
  fakeJpeg,
  fakePng,
  ooxmlFile,
} from "../../test/ooxml-fixtures";

// Same policy as the image engine tests (decision D5): happy-dom cannot touch
// pixels, so the RasterCodec is a deterministic fake and Vitest proves the
// PACKAGE logic -- which parts are re-encoded, renamed, rewritten or left
// byte-identical. Real pixel proof lands in the browser E2E suite (T5/T7).
function fakeCodec(
  source: SourceDimensions = { width: 100, height: 100 },
  bytesPerPixel = 0.1,
): { codec: RasterCodec; plans: EncodePlan[] } {
  const plans: EncodePlan[] = [];
  const codec: RasterCodec = {
    reencode(_data, _mime, planFor) {
      const plan = planFor(source);
      plans.push(plan);
      const area = plan.targetWidth * plan.targetHeight;
      const size = Math.max(1, Math.round(area * (plan.quality ?? 1) * bytesPerPixel));
      return Promise.resolve(new Blob([new Uint8Array(size)], { type: plan.mimeType }));
    },
  };
  return { codec, plans };
}

const failingCodec: RasterCodec = {
  reencode() {
    return Promise.reject(new Error("decode blew up"));
  },
};

const maximum: CompressionProfile = { level: "maximum", imageQuality: 55, maxDimension: 1920 };

async function unzipResult(blob: Blob): Promise<Record<string, Uint8Array>> {
  return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

describe("office engine (compress)", () => {
  it.each(["docx", "pptx", "xlsx"] as const)(
    "shrinks an image-heavy %s and keeps the content XML byte-for-byte",
    async (kind) => {
      const media = { "image1.jpeg": fakeJpeg(40_000), "image2.jpeg": fakeJpeg(30_000) };
      const input = buildOoxml(kind, { media });
      const engine = createOfficeEngine({ codec: fakeCodec().codec });
      const result = await engine.compress(ooxmlFile(kind, input), maximum);

      expect(result.isEstimate).toBe(false);
      expect(result.sampled).toBe(false);
      expect(result.bytesAfter).toBeLessThan(result.bytesBefore);
      expect(result.gainPercent).toBeGreaterThan(0);

      const out = await unzipResult(result.blob);
      const mediaDir = { docx: "word/media", pptx: "ppt/media", xlsx: "xl/media" }[kind];
      expect(out[`${mediaDir}/image1.jpeg`]?.length).toBe(550); // 100*100*0.55*0.1
      expect(out[`${mediaDir}/image2.jpeg`]?.length).toBe(550);
      for (const [path, xml] of Object.entries(contentPartsOf(kind))) {
        expect(strFromU8(out[path] ?? new Uint8Array())).toBe(xml);
      }
    },
  );

  it("re-encodes an opaque png as jpeg and rewrites [Content_Types].xml + .rels", async () => {
    const input = buildOoxml("docx", {
      media: { "image1.png": fakePng({ colorType: 2, size: 40_000 }) },
      imageDefaults: ["png"],
    });
    const engine = createOfficeEngine({ codec: fakeCodec().codec });
    const result = await engine.compress(ooxmlFile("docx", input), maximum);

    const out = await unzipResult(result.blob);
    expect(out["word/media/image1.png"]).toBeUndefined();
    expect(out["word/media/image1.jpeg"]?.length).toBe(550);
    const contentTypes = strFromU8(out["[Content_Types].xml"] ?? new Uint8Array());
    expect(contentTypes).toContain('<Default Extension="jpeg" ContentType="image/jpeg"/>');
    const rels = strFromU8(out["word/_rels/document.xml.rels"] ?? new Uint8Array());
    expect(rels).toContain('Target="media/image1.jpeg"');
    expect(rels).not.toContain('Target="media/image1.png"');
  });

  it("keeps a transparent png byte-for-byte and never sends it to the codec", async () => {
    const alphaPng = fakePng({ colorType: 6, size: 30_000 });
    const input = buildOoxml("docx", { media: { "image1.png": alphaPng } });
    const { codec, plans } = fakeCodec();
    const result = await createOfficeEngine({ codec }).compress(ooxmlFile("docx", input), maximum);

    expect(plans).toHaveLength(0);
    const out = await unzipResult(result.blob);
    expect(out["word/media/image1.png"]).toEqual(alphaPng);
  });

  it("optimizes a transparent png through the lossless seam when provided", async () => {
    const alphaPng = fakePng({ colorType: 6, size: 30_000 });
    const smaller = alphaPng.slice(0, 10_000);
    const input = buildOoxml("docx", { media: { "image1.png": alphaPng } });
    const engine = createOfficeEngine({
      codec: fakeCodec().codec,
      losslessPng: (data) => Promise.resolve(data.slice(0, 10_000)),
    });
    const result = await engine.compress(ooxmlFile("docx", input), maximum);
    const out = await unzipResult(result.blob);
    expect(out["word/media/image1.png"]).toEqual(smaller);
  });

  it("discards a lossless result that grows the png", async () => {
    const alphaPng = fakePng({ colorType: 6, size: 5_000 });
    const input = buildOoxml("docx", { media: { "image1.png": alphaPng } });
    const engine = createOfficeEngine({
      codec: fakeCodec().codec,
      losslessPng: (data) => Promise.resolve(new Uint8Array(data.length + 1_000)),
    });
    const result = await engine.compress(ooxmlFile("docx", input), maximum);
    const out = await unzipResult(result.blob);
    expect(out["word/media/image1.png"]).toEqual(alphaPng);
  });

  it("keeps the original media when the re-encode grows the file", async () => {
    const tinyJpeg = fakeJpeg(64); // fake codec would output 550 bytes
    const input = buildOoxml("docx", { media: { "image1.jpeg": tinyJpeg } });
    const result = await createOfficeEngine({ codec: fakeCodec().codec }).compress(
      ooxmlFile("docx", input),
      maximum,
    );
    const out = await unzipResult(result.blob);
    expect(out["word/media/image1.jpeg"]).toEqual(tinyJpeg);
  });

  it("copies non-image media through intact", async () => {
    const emf = fakeBinary(5_000);
    const input = buildOoxml("pptx", { media: { "diagram1.emf": emf, "image1.jpeg": fakeJpeg(20_000) } });
    const result = await createOfficeEngine({ codec: fakeCodec().codec }).compress(
      ooxmlFile("pptx", input),
      maximum,
    );
    const out = await unzipResult(result.blob);
    expect(out["ppt/media/diagram1.emf"]).toEqual(emf);
    expect(out["ppt/media/image1.jpeg"]?.length).toBe(550);
  });

  it("produces a valid, uncorrupted package for a file without images", async () => {
    const input = buildOoxml("docx", { media: {}, imageDefaults: [] });
    const inputParts = unzipSync(input);
    const result = await createOfficeEngine({ codec: fakeCodec().codec }).compress(
      ooxmlFile("docx", input),
      maximum,
    );

    const out = await unzipResult(result.blob);
    expect(Object.keys(out).sort()).toEqual(Object.keys(inputParts).sort());
    for (const [path, bytes] of Object.entries(inputParts)) {
      expect(out[path]).toEqual(bytes);
    }
    expect(result.gainPercent).toBeGreaterThanOrEqual(0);
  });

  it("suppresses png renames when xl/richData is present (parts stay untouched)", async () => {
    const richPart = strToU8('<?xml version="1.0"?><rvData/>');
    const opaquePng = fakePng({ colorType: 2, size: 40_000 });
    const input = buildOoxml("xlsx", {
      media: { "image1.png": opaquePng, "image2.jpeg": fakeJpeg(20_000) },
      extraParts: { "xl/richData/rdrichvalue.xml": richPart },
    });
    const result = await createOfficeEngine({ codec: fakeCodec().codec }).compress(
      ooxmlFile("xlsx", input),
      maximum,
    );

    const out = await unzipResult(result.blob);
    // The opaque png would need a rename to become jpeg: suppressed, kept as-is.
    expect(out["xl/media/image1.png"]).toEqual(opaquePng);
    // Same-format re-encoding stays active.
    expect(out["xl/media/image2.jpeg"]?.length).toBe(550);
    expect(out["xl/richData/rdrichvalue.xml"]).toEqual(richPart);
  });

  it("keeps the original bytes when one image fails to decode", async () => {
    const jpeg = fakeJpeg(20_000);
    const input = buildOoxml("docx", { media: { "image1.jpeg": jpeg } });
    const result = await createOfficeEngine({ codec: failingCodec }).compress(
      ooxmlFile("docx", input),
      maximum,
    );
    const out = await unzipResult(result.blob);
    expect(out["word/media/image1.jpeg"]).toEqual(jpeg);
  });

  it("throws corrupted-file for bytes that are not a zip", async () => {
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])], "broken.docx");
    const engine = createOfficeEngine({ codec: fakeCodec().codec });
    const error = await engine.compress(file, maximum).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CompressionError);
    expect((error as CompressionError).code).toBe("corrupted-file");
  });
});

describe("office engine (estimate)", () => {
  function manyJpegsDocx(count: number): { file: File; totalMediaBytes: number; topBytes: number[] } {
    const media: Record<string, Uint8Array> = {};
    const sizes: number[] = [];
    for (let i = 0; i < count; i++) {
      const size = 10_000 + i * 1_000;
      sizes.push(size);
      media[`image${(i + 1).toString()}.jpeg`] = fakeJpeg(size);
    }
    const file = ooxmlFile("docx", buildOoxml("docx", { media }));
    const topBytes = [...sizes].sort((a, b) => b - a).slice(0, OFFICE_SAMPLE_COUNT);
    return { file, totalMediaBytes: sizes.reduce((s, v) => s + v, 0), topBytes };
  }

  it("returns an exact result when the package has few images", async () => {
    const { file } = manyJpegsDocx(2);
    const engine = createOfficeEngine({ codec: fakeCodec().codec });
    const result = await engine.estimate?.(file, maximum);
    expect(result?.isEstimate).toBe(false);
    expect(result?.sampled).toBe(false);
  });

  it("samples the largest images and extrapolates over all media bytes", async () => {
    const { file, totalMediaBytes, topBytes } = manyJpegsDocx(7);
    const engine = createOfficeEngine({ codec: fakeCodec().codec });
    const result = await engine.estimate?.(file, maximum);

    expect(result?.isEstimate).toBe(true);
    expect(result?.sampled).toBe(true);

    const perImage = 550; // 100*100 * 0.55 * 0.1, accepted (smaller than every source)
    const sampleBefore = topBytes.reduce((s, v) => s + v, 0);
    const sampleAfter = perImage * OFFICE_SAMPLE_COUNT;
    const estimatedMediaAfter = Math.round(totalMediaBytes * (sampleAfter / sampleBefore));
    const expectedAfter = file.size - totalMediaBytes + estimatedMediaAfter;
    expect(result?.bytesAfter).toBe(expectedAfter);
    expect(result?.bytesBefore).toBe(file.size);
    // The blob is the recompressed sample, not the final package.
    expect(result?.blob.size).toBe(sampleAfter);
  });

  it("honors a custom sampleCount", async () => {
    const { file } = manyJpegsDocx(4);
    const engine = createOfficeEngine({ codec: fakeCodec().codec, sampleCount: 3 });
    const result = await engine.estimate?.(file, maximum);
    expect(result?.isEstimate).toBe(true);
    expect(result?.blob.size).toBe(550 * 3);
  });
});
