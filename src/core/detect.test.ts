import { describe, expect, it } from "vitest";
import { detectType } from "./detect";

function buf(bytes: number[], padTo = 0): ArrayBuffer {
  const view = new Uint8Array(Math.max(bytes.length, padTo));
  view.set(bytes);
  return view.buffer;
}

/** Builds a zip-header buffer that also contains "[Content_Types].xml". */
function ooxmlBuf(): ArrayBuffer {
  const header = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00];
  const marker = Array.from(new TextEncoder().encode("[Content_Types].xml"));
  return buf([...header, ...marker]);
}

describe("detectType", () => {
  it("detects PNG as image", () => {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    expect(detectType("photo.png", buf(png))).toEqual({ family: "image", format: "png" });
  });

  it("detects JPEG even with a wrong extension (magic bytes win)", () => {
    expect(detectType("photo.png", buf([0xff, 0xd8, 0xff, 0xe0]))).toEqual({
      family: "image",
      format: "jpeg",
    });
  });

  it("detects WebP via the RIFF/WEBP container", () => {
    const riffWebp = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
    expect(detectType("img.webp", buf(riffWebp))).toEqual({ family: "image", format: "webp" });
  });

  it("detects AVIF via ftypavif at offset 4", () => {
    const avif = [0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66];
    expect(detectType("img.avif", buf(avif))).toEqual({ family: "image", format: "avif" });
  });

  it("detects PDF", () => {
    expect(detectType("doc.pdf", buf([0x25, 0x50, 0x44, 0x46, 0x2d]))).toEqual({
      family: "pdf",
      format: "pdf",
    });
  });

  it("detects Office zip containers via [Content_Types].xml, subtyped by extension", () => {
    expect(detectType("report.docx", ooxmlBuf())).toEqual({ family: "office", format: "docx" });
    expect(detectType("sheet.xlsx", ooxmlBuf())).toEqual({ family: "office", format: "xlsx" });
    expect(detectType("deck.pptx", ooxmlBuf())).toEqual({ family: "office", format: "pptx" });
  });

  it("labels an OOXML zip with an unknown extension as generic ooxml", () => {
    expect(detectType("mystery.bin", ooxmlBuf())).toEqual({ family: "office", format: "ooxml" });
  });

  it("returns null for a plain zip that is not an Office file", () => {
    const plainZip = [0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0x68, 0x69];
    expect(detectType("archive.zip", buf(plainZip))).toBeNull();
  });

  it("returns null for unknown content", () => {
    expect(detectType("mystery.bin", buf([0x00, 0x01, 0x02]))).toBeNull();
  });
});
