import { strToU8, zipSync } from "fflate";

// Test-only OOXML fixture factory: builds minimal but structurally faithful
// DOCX/PPTX/XLSX packages entirely in code (no binary fixtures in the repo).
// The XML skeletons are the real OPC shapes (content types, package rels, part
// rels); the images are byte-level fakes with correct magic bytes and PNG
// chunk structure -- the office engine never decodes pixels under Vitest (the
// RasterCodec seam is faked there, same policy as the image engine tests).

/**
 * Deterministic LCG noise: real JPEG/PNG payloads are entropy-dense, so the
 * zip stores them ~uncompressed. Constant-filled fixtures would deflate to
 * almost nothing and break any size arithmetic that models real media.
 */
function pseudoRandomFill(data: Uint8Array, from: number, to: number, seed: number): void {
  let x = seed >>> 0;
  for (let i = from; i < to; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    // High byte only: an LCG's low bits are very short-period (compressible),
    // the top byte behaves closer to uniform noise, so the zip stores it whole.
    data[i] = (x >>> 24) & 0xff;
  }
}

function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function pngChunk(type: string, payload: number[]): number[] {
  const typeBytes = Array.from(strToU8(type));
  // CRC is zeroed: nothing in the engine (nor in fflate) validates PNG CRCs.
  return [...u32be(payload.length), ...typeBytes, ...payload, 0, 0, 0, 0];
}

export interface FakePngOptions {
  /** IHDR color type: 2 = opaque RGB, 6 = RGBA. */
  colorType?: 2 | 3 | 6;
  /** Adds a tRNS chunk before IDAT (palette / keyed transparency). */
  withTrns?: boolean;
  /** Approximate total byte size, padded via the IDAT payload. */
  size?: number;
}

/** A structurally valid PNG (signature + IHDR + IDAT + IEND, zeroed CRCs). */
export function fakePng(options: FakePngOptions = {}): Uint8Array {
  const { colorType = 2, withTrns = false, size = 4096 } = options;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = pngChunk("IHDR", [...u32be(64), ...u32be(64), 8, colorType, 0, 0, 0]);
  const trns = withTrns ? pngChunk("tRNS", [0]) : [];
  const overhead = signature.length + ihdr.length + trns.length + pngChunk("IEND", []).length + 12;
  const idatPayload = new Uint8Array(Math.max(1, size - overhead));
  pseudoRandomFill(idatPayload, 0, idatPayload.length, 0xc0ffee);
  const idat = pngChunk("IDAT", Array.from(idatPayload));
  const iend = pngChunk("IEND", []);
  return new Uint8Array([...signature, ...ihdr, ...trns, ...idat, ...iend]);
}

/** Bytes with a JPEG signature (SOI + APP0) and EOI, padded to `size`. */
export function fakeJpeg(size = 4096): Uint8Array {
  const data = new Uint8Array(Math.max(6, size));
  pseudoRandomFill(data, 4, data.length - 2, size);
  data.set([0xff, 0xd8, 0xff, 0xe0], 0);
  data.set([0xff, 0xd9], data.length - 2);
  return data;
}

/** Bytes that are not any known raster (models an EMF/WMF or video stream). */
export function fakeBinary(size = 2048): Uint8Array {
  const data = new Uint8Array(size).fill(0x07);
  data.set([0x01, 0x00, 0x00, 0x00], 0);
  return data;
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export type OoxmlKind = "docx" | "pptx" | "xlsx";

export interface OoxmlFixtureOptions {
  /** Media files placed in the kind's media folder (word/media, ppt/media, xl/media). */
  media?: Record<string, Uint8Array>;
  /** Image extensions declared as <Default> in [Content_Types].xml. */
  imageDefaults?: readonly string[];
  /** Extra parts appended verbatim (path -> bytes), e.g. xl/richData fixtures. */
  extraParts?: Record<string, Uint8Array>;
}

function contentTypesXml(kind: OoxmlKind, imageDefaults: readonly string[]): string {
  const defaults = imageDefaults
    .map((ext) => {
      const mime = ext === "jpeg" || ext === "jpg" ? "image/jpeg" : `image/${ext}`;
      return `<Default Extension="${ext}" ContentType="${mime}"/>`;
    })
    .join("");
  const overrides: Record<OoxmlKind, string> = {
    docx: `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`,
    pptx:
      `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
      `<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    xlsx:
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  };
  return (
    `${XML_HEADER}<Types xmlns="${CT_NS}">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    defaults +
    overrides[kind] +
    `</Types>`
  );
}

function mediaRels(names: readonly string[], targetPrefix: string): string {
  const relationships = names
    .map(
      (name, index) =>
        `<Relationship Id="rIdImg${(index + 1).toString()}" Type="${OFFICE_REL}/image" Target="${targetPrefix}${name}"/>`,
    )
    .join("");
  return `${XML_HEADER}<Relationships xmlns="${REL_NS}">${relationships}</Relationships>`;
}

/** The content-XML payloads the engine must never alter, keyed by part path. */
export function contentPartsOf(kind: OoxmlKind): Record<string, string> {
  if (kind === "docx") {
    return {
      "word/document.xml": `${XML_HEADER}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello T4</w:t></w:r></w:p></w:body></w:document>`,
    };
  }
  if (kind === "pptx") {
    return {
      "ppt/presentation.xml": `${XML_HEADER}<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`,
      "ppt/slides/slide1.xml": `${XML_HEADER}<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld/></p:sld>`,
    };
  }
  return {
    "xl/workbook.xml": `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Sheet1" sheetId="1"/></sheets></workbook>`,
    "xl/worksheets/sheet1.xml": `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`,
  };
}

/** Builds a minimal, structurally valid OOXML package as zip bytes. */
export function buildOoxml(kind: OoxmlKind, options: OoxmlFixtureOptions = {}): Uint8Array {
  const { media = {}, imageDefaults = ["png", "jpeg"], extraParts = {} } = options;
  const mediaNames = Object.keys(media);
  const parts: Record<string, Uint8Array> = {};

  parts["[Content_Types].xml"] = strToU8(contentTypesXml(kind, imageDefaults));

  const mainPart: Record<OoxmlKind, string> = {
    docx: "word/document.xml",
    pptx: "ppt/presentation.xml",
    xlsx: "xl/workbook.xml",
  };
  parts["_rels/.rels"] = strToU8(
    `${XML_HEADER}<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL}/officeDocument" Target="${mainPart[kind]}"/></Relationships>`,
  );

  for (const [path, xml] of Object.entries(contentPartsOf(kind))) {
    parts[path] = strToU8(xml);
  }

  if (kind === "docx") {
    parts["word/_rels/document.xml.rels"] = strToU8(mediaRels(mediaNames, "media/"));
    for (const [name, bytes] of Object.entries(media)) parts[`word/media/${name}`] = bytes;
  } else if (kind === "pptx") {
    parts["ppt/slides/_rels/slide1.xml.rels"] = strToU8(mediaRels(mediaNames, "../media/"));
    for (const [name, bytes] of Object.entries(media)) parts[`ppt/media/${name}`] = bytes;
  } else {
    parts["xl/drawings/drawing1.xml"] = strToU8(
      `${XML_HEADER}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"/>`,
    );
    parts["xl/drawings/_rels/drawing1.xml.rels"] = strToU8(mediaRels(mediaNames, "../media/"));
    for (const [name, bytes] of Object.entries(media)) parts[`xl/media/${name}`] = bytes;
  }

  for (const [path, bytes] of Object.entries(extraParts)) parts[path] = bytes;

  return zipSync(parts, { level: 9 });
}

/** Wraps package bytes in a File named like a real upload. */
export function ooxmlFile(kind: OoxmlKind, bytes: Uint8Array, name?: string): File {
  const mime: Record<OoxmlKind, string> = {
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return new File([bytes.slice().buffer], name ?? `fixture.${kind}`, { type: mime[kind] });
}
