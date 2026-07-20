// @vitest-environment node
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { PDFDict } from "pdf-lib";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { collectJpegXObjects, isEligibleJpegImageDict, replaceJpegXObject } from "./jpeg-xobjects";
import { encodeRgbaToJpeg } from "../../test/jsquash-node-codec";
import { synthScanPageRgba } from "../../test/pdf-fixtures";

// pdf-lib does not export its internal LiteralObject type; this mirrors the
// subset the fixtures below need (names, numbers, booleans and arrays).
type DictValue = string | number | boolean | DictValue[];

async function craftedDict(entries: Record<string, DictValue>): Promise<PDFDict> {
  const doc = await PDFDocument.create();
  return doc.context.obj(entries);
}

const ELIGIBLE = {
  Subtype: "Image",
  Filter: "DCTDecode",
  BitsPerComponent: 8,
  ColorSpace: "DeviceRGB",
  Width: 10,
  Height: 10,
};

describe("isEligibleJpegImageDict", () => {
  it("accepts a plain opaque 8-bit DCTDecode image", async () => {
    expect(isEligibleJpegImageDict(await craftedDict(ELIGIBLE))).toBe(true);
  });

  it("accepts DeviceGray and a single-element Filter array", async () => {
    expect(
      isEligibleJpegImageDict(
        await craftedDict({ ...ELIGIBLE, ColorSpace: "DeviceGray", Filter: ["DCTDecode"] }),
      ),
    ).toBe(true);
  });

  it("rejects non-JPEG filters", async () => {
    expect(isEligibleJpegImageDict(await craftedDict({ ...ELIGIBLE, Filter: "FlateDecode" }))).toBe(
      false,
    );
    expect(
      isEligibleJpegImageDict(
        await craftedDict({ ...ELIGIBLE, Filter: ["FlateDecode", "DCTDecode"] }),
      ),
    ).toBe(false);
  });

  it("rejects images carrying transparency (SMask / Mask / ImageMask)", async () => {
    expect(isEligibleJpegImageDict(await craftedDict({ ...ELIGIBLE, SMask: "None" }))).toBe(false);
    expect(isEligibleJpegImageDict(await craftedDict({ ...ELIGIBLE, Mask: [0, 0] }))).toBe(false);
    expect(isEligibleJpegImageDict(await craftedDict({ ...ELIGIBLE, ImageMask: true }))).toBe(
      false,
    );
  });

  it("rejects unusual encodings (bit depth, CMYK, custom Decode)", async () => {
    expect(isEligibleJpegImageDict(await craftedDict({ ...ELIGIBLE, BitsPerComponent: 16 }))).toBe(
      false,
    );
    expect(
      isEligibleJpegImageDict(await craftedDict({ ...ELIGIBLE, ColorSpace: "DeviceCMYK" })),
    ).toBe(false);
    expect(
      isEligibleJpegImageDict(await craftedDict({ ...ELIGIBLE, Decode: [1, 0, 1, 0, 1, 0] })),
    ).toBe(false);
  });

  it("rejects non-image streams", async () => {
    expect(
      isEligibleJpegImageDict(await craftedDict({ Subtype: "Form", Filter: "DCTDecode" })),
    ).toBe(false);
  });
});

async function scannedDoc(jpeg: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const image = await doc.embedJpg(jpeg);
  const page = doc.addPage([200, 150]);
  page.drawImage(image, { x: 0, y: 0, width: 200, height: 150 });
  return doc.save({ useObjectStreams: false });
}

// Minimal in-test PNG writer (RGBA, no deps): pdf-lib splits a PNG's alpha
// channel into an SMask'd FlateDecode image, the exact shape the collector
// must leave alone.
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typed = new Uint8Array(4 + data.length);
  typed.set(new TextEncoder().encode(type));
  typed.set(data, 4);
  const out = new Uint8Array(8 + data.length + 4);
  new DataView(out.buffer).setUint32(0, data.length);
  out.set(typed, 4);
  new DataView(out.buffer).setUint32(8 + data.length, crc32(typed));
  return out;
}

function makeTinyRgbaPng(size: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, size);
  ihdrView.setUint32(4, size);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit, color type 6 = RGBA
  const raw = new Uint8Array(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4);
    for (let x = 0; x < size; x++) {
      raw.set([255, 0, 0, x % 2 === 0 ? 128 : 255], row + 1 + x * 4);
    }
  }
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array(deflateSync(raw))),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

describe("collectJpegXObjects / replaceJpegXObject", () => {
  it("finds an embedded JPEG with its geometry and raw bytes", async () => {
    const dims = { width: 160, height: 120 };
    const jpeg = await encodeRgbaToJpeg(synthScanPageRgba(dims, 7), dims, 90);
    const doc = await PDFDocument.load(await scannedDoc(jpeg));
    const targets = collectJpegXObjects(doc);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.width).toBe(160);
    expect(targets[0]?.height).toBe(120);
    expect(targets[0]?.bytes).toEqual(jpeg);
  });

  it("leaves an alpha PNG (FlateDecode + SMask) uncollected", async () => {
    const doc = await PDFDocument.create();
    const image = await doc.embedPng(makeTinyRgbaPng(8));
    const page = doc.addPage([100, 100]);
    page.drawImage(image, { x: 0, y: 0, width: 100, height: 100 });
    const loaded = await PDFDocument.load(await doc.save({ useObjectStreams: false }));
    // The image XObject is present...
    const imageStreams = loaded.context
      .enumerateIndirectObjects()
      .filter(
        ([, object]) =>
          object instanceof PDFRawStream &&
          object.dict.lookup(PDFName.of("Subtype")) === PDFName.of("Image"),
      );
    expect(imageStreams.length).toBeGreaterThan(0);
    // ...but nothing is eligible for re-encoding.
    expect(collectJpegXObjects(loaded)).toHaveLength(0);
  });

  it("swaps the stream and geometry, and the document survives a reload", async () => {
    const dims = { width: 160, height: 120 };
    const jpeg = await encodeRgbaToJpeg(synthScanPageRgba(dims, 7), dims, 90);
    const doc = await PDFDocument.load(await scannedDoc(jpeg));
    const target = collectJpegXObjects(doc)[0];
    expect(target).toBeDefined();
    if (target === undefined) return;

    const smallDims = { width: 80, height: 60 };
    const smaller = await encodeRgbaToJpeg(synthScanPageRgba(smallDims, 7), smallDims, 55);
    replaceJpegXObject(doc, target, { bytes: smaller, width: 80, height: 60 });

    const reloaded = await PDFDocument.load(await doc.save({ useObjectStreams: false }));
    expect(reloaded.getPageCount()).toBe(1);
    const swapped = collectJpegXObjects(reloaded);
    expect(swapped).toHaveLength(1);
    expect(swapped[0]?.width).toBe(80);
    expect(swapped[0]?.height).toBe(60);
    expect(swapped[0]?.bytes).toEqual(smaller);
  });
});
