import { describe, expect, it } from "vitest";
import {
  findMediaImages,
  isMediaPath,
  pngHasTransparency,
  renamedMediaPath,
  resolveRelsTarget,
  rewriteContentTypes,
  rewriteRels,
  sniffImageFormat,
} from "./ooxml";
import type { MediaRename } from "./ooxml";
import { fakeBinary, fakeJpeg, fakePng } from "../../test/ooxml-fixtures";

describe("sniffImageFormat", () => {
  it("recognizes png, jpeg and webp by magic bytes", () => {
    expect(sniffImageFormat(fakePng())).toBe("png");
    expect(sniffImageFormat(fakeJpeg())).toBe("jpeg");
    const webp = new Uint8Array(32);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffImageFormat(webp)).toBe("webp");
  });

  it("returns null for non-raster bytes (emf/wmf/video)", () => {
    expect(sniffImageFormat(fakeBinary())).toBeNull();
    expect(sniffImageFormat(new Uint8Array(2))).toBeNull();
  });

  it("does not trust the RIFF header alone", () => {
    const riffOnly = new Uint8Array(32);
    riffOnly.set([0x52, 0x49, 0x46, 0x46], 0);
    expect(sniffImageFormat(riffOnly)).toBeNull();
  });
});

describe("pngHasTransparency", () => {
  it("reports alpha for RGBA (color type 6)", () => {
    expect(pngHasTransparency(fakePng({ colorType: 6 }))).toBe(true);
  });

  it("reports no alpha for opaque RGB (color type 2)", () => {
    expect(pngHasTransparency(fakePng({ colorType: 2 }))).toBe(false);
  });

  it("reports alpha when a tRNS chunk precedes IDAT", () => {
    expect(pngHasTransparency(fakePng({ colorType: 3, withTrns: true }))).toBe(true);
    expect(pngHasTransparency(fakePng({ colorType: 2, withTrns: true }))).toBe(true);
  });

  it("is conservative on truncated data (assumes alpha)", () => {
    expect(pngHasTransparency(fakePng().slice(0, 20))).toBe(true);
  });
});

describe("isMediaPath", () => {
  it("accepts the three OOXML media folders only", () => {
    expect(isMediaPath("word/media/image1.png")).toBe(true);
    expect(isMediaPath("ppt/media/image1.jpeg")).toBe(true);
    expect(isMediaPath("xl/media/image1.png")).toBe(true);
    expect(isMediaPath("xl/richData/image1.png")).toBe(false);
    expect(isMediaPath("docProps/thumbnail.jpeg")).toBe(false);
    expect(isMediaPath("word/embeddings/oleObject1.bin")).toBe(false);
  });
});

describe("findMediaImages", () => {
  it("collects only re-encodable rasters inside media folders", () => {
    const files = {
      "word/document.xml": new Uint8Array([1]),
      "word/media/image1.png": fakePng({ colorType: 6 }),
      "word/media/image2.jpeg": fakeJpeg(),
      "word/media/video1.mp4": fakeBinary(),
      "docProps/thumbnail.jpeg": fakeJpeg(),
    };
    const images = findMediaImages(files);
    expect(images.map((i) => i.path)).toEqual(["word/media/image1.png", "word/media/image2.jpeg"]);
    expect(images[0]?.hasAlpha).toBe(true);
    expect(images[1]?.format).toBe("jpeg");
  });
});

describe("resolveRelsTarget", () => {
  it("resolves relative targets against the owning part's folder", () => {
    expect(resolveRelsTarget("word/_rels/document.xml.rels", "media/image1.png")).toBe(
      "word/media/image1.png",
    );
    expect(resolveRelsTarget("ppt/slides/_rels/slide1.xml.rels", "../media/image1.png")).toBe(
      "ppt/media/image1.png",
    );
    expect(resolveRelsTarget("_rels/.rels", "word/document.xml")).toBe("word/document.xml");
  });

  it("resolves absolute targets by dropping the leading slash", () => {
    expect(resolveRelsTarget("word/_rels/document.xml.rels", "/word/media/x.png")).toBe(
      "word/media/x.png",
    );
  });

  it("returns null for external targets", () => {
    expect(resolveRelsTarget("word/_rels/document.xml.rels", "https://example.com/x.png")).toBeNull();
    expect(resolveRelsTarget("word/_rels/document.xml.rels", "mailto:kevin@example.com")).toBeNull();
  });
});

describe("renamedMediaPath", () => {
  it("swaps the extension in place", () => {
    expect(renamedMediaPath("word/media/image1.png", "jpeg")).toBe("word/media/image1.jpeg");
  });

  it("returns null when the file name has no extension", () => {
    expect(renamedMediaPath("word/media/image1", "jpeg")).toBeNull();
  });
});

const RENAME: MediaRename = {
  oldPath: "word/media/image1.png",
  newPath: "word/media/image1.jpeg",
  newExtension: "jpeg",
  newContentType: "image/jpeg",
};

describe("rewriteRels", () => {
  const rels =
    `<Relationships><Relationship Id="rId1" Type="t" Target="media/image1.png"/>` +
    `<Relationship Id="rId2" Type="t" Target="media/image2.png"/>` +
    `<Relationship Id="rId3" Type="t" Target="https://example.com/image1.png" TargetMode="External"/></Relationships>`;

  it("rewrites only the targets that resolve to a renamed part", () => {
    const rewritten = rewriteRels(rels, "word/_rels/document.xml.rels", [RENAME]);
    expect(rewritten).toContain('Target="media/image1.jpeg"');
    expect(rewritten).toContain('Target="media/image2.png"');
    expect(rewritten).toContain('Target="https://example.com/image1.png"');
  });

  it("returns null when nothing matches", () => {
    expect(rewriteRels(rels, "ppt/slides/_rels/slide1.xml.rels", [RENAME])).toBeNull();
    expect(rewriteRels(rels, "word/_rels/document.xml.rels", [])).toBeNull();
  });
});

describe("rewriteContentTypes", () => {
  const withoutJpeg =
    `<Types><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="png" ContentType="image/png"/></Types>`;

  it("adds a Default for the new extension when missing", () => {
    const rewritten = rewriteContentTypes(withoutJpeg, [RENAME]);
    expect(rewritten).toContain('<Default Extension="jpeg" ContentType="image/jpeg"/>');
    // The png Default stays: other parts may still use it.
    expect(rewritten).toContain('Extension="png"');
  });

  it("does not duplicate an existing Default (case-insensitive)", () => {
    const withJpeg = withoutJpeg.replace(
      "</Types>",
      '<Default Extension="JPEG" ContentType="image/jpeg"/></Types>',
    );
    expect(rewriteContentTypes(withJpeg, [RENAME])).toBeNull();
  });

  it("updates an Override that names the renamed part", () => {
    const withOverride = withoutJpeg.replace(
      "</Types>",
      '<Override PartName="/word/media/image1.png" ContentType="image/png"/></Types>',
    );
    const rewritten = rewriteContentTypes(withOverride, [RENAME]);
    expect(rewritten).toContain('<Override PartName="/word/media/image1.jpeg" ContentType="image/jpeg"/>');
    expect(rewritten).not.toContain('PartName="/word/media/image1.png"');
  });

  it("returns null when there is nothing to rename", () => {
    expect(rewriteContentTypes(withoutJpeg, [])).toBeNull();
  });
});
