import type { PDFDocument, PDFRef } from "pdf-lib";
import { PDFArray, PDFBool, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFStream } from "pdf-lib";

// Enumeration + replacement of embedded JPEG image XObjects, done entirely on
// pdf-lib's low-level object table. Using pdf-lib as the single source for both
// finding and rewriting avoids the fragile pdfjs objs-name -> pdf-lib ref
// mapping (approved T3 plan deviation); pdfjs is still used to validate that
// the rewritten document opens with the same page count (see pdf-engine.ts).
//
// v1 SCOPE LIMIT (documented for T7 user docs + project memory): only
// DCTDecode (baseline JPEG) images are re-encoded. FlateDecode raster images
// (PNG-like scans) would require decoding raw pixel data with full
// colorspace/predictor handling and an RGBA encoder seam, and are left intact:
// they still benefit from the qpdf structural pass. Images carrying
// transparency (SMask/Mask) or unusual encodings are intentionally left
// untouched rather than risking corruption (T3 spec).

export interface JpegXObjectTarget {
  ref: PDFRef;
  /** Raw DCTDecode stream contents: a complete JPEG file. */
  bytes: Uint8Array;
  width: number;
  height: number;
}

const SUBTYPE = PDFName.of("Subtype");
const IMAGE = PDFName.of("Image");
const FILTER = PDFName.of("Filter");
const DCT_DECODE = PDFName.of("DCTDecode");
const COLOR_SPACE = PDFName.of("ColorSpace");
const ICC_BASED = PDFName.of("ICCBased");
const N = PDFName.of("N");

function numberEntry(dict: PDFDict, key: string): number | null {
  const value = dict.lookup(PDFName.of(key));
  return value instanceof PDFNumber ? value.asNumber() : null;
}

/** True when Filter is exactly DCTDecode (bare name or single-element array). */
function isDctOnlyFilter(dict: PDFDict): boolean {
  const filter = dict.lookup(FILTER);
  if (filter instanceof PDFName) return filter === DCT_DECODE;
  if (filter instanceof PDFArray) {
    return filter.size() === 1 && filter.lookup(0) === DCT_DECODE;
  }
  return false;
}

/**
 * True for DeviceRGB, DeviceGray, or an ICCBased space with 1 or 3 components.
 * Everything else (Indexed palettes, Separation, CMYK...) is rejected: the
 * RasterCodec re-encodes to a 3-channel JPEG and could not preserve those.
 */
function isSupportedColorSpace(dict: PDFDict): boolean {
  const space = dict.lookup(COLOR_SPACE);
  if (space instanceof PDFName) {
    return space === PDFName.of("DeviceRGB") || space === PDFName.of("DeviceGray");
  }
  if (space instanceof PDFArray && space.size() === 2 && space.lookup(0) === ICC_BASED) {
    const profile = space.lookup(1);
    if (!(profile instanceof PDFStream)) return false;
    const components = profile.dict.lookup(N);
    return (
      components instanceof PDFNumber &&
      (components.asNumber() === 1 || components.asNumber() === 3)
    );
  }
  return false;
}

/**
 * Eligibility gate for re-encoding. Deliberately conservative: anything not
 * provably a plain, opaque, 8-bit baseline JPEG is skipped (left intact).
 * Exported for direct unit testing.
 */
export function isEligibleJpegImageDict(dict: PDFDict): boolean {
  if (dict.lookup(SUBTYPE) !== IMAGE) return false;
  if (!isDctOnlyFilter(dict)) return false;
  // Transparency: never touch images with a soft mask or stencil/color-key
  // mask -- re-encoding would break or desynchronize the mask (T3 spec).
  if (dict.has(PDFName.of("SMask")) || dict.has(PDFName.of("Mask"))) return false;
  const imageMask = dict.lookup(PDFName.of("ImageMask"));
  if (imageMask instanceof PDFBool && imageMask.asBoolean()) return false;
  // Custom sample decoding (e.g. inverted ranges) would be lost on re-encode.
  if (dict.has(PDFName.of("Decode"))) return false;
  if (numberEntry(dict, "BitsPerComponent") !== 8) return false;
  if (!isSupportedColorSpace(dict)) return false;
  return numberEntry(dict, "Width") !== null && numberEntry(dict, "Height") !== null;
}

/** Collects every re-encodable JPEG image XObject in the document. */
export function collectJpegXObjects(doc: PDFDocument): JpegXObjectTarget[] {
  const targets: JpegXObjectTarget[] = [];
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    if (!isEligibleJpegImageDict(object.dict)) continue;
    const width = numberEntry(object.dict, "Width");
    const height = numberEntry(object.dict, "Height");
    if (width === null || height === null) continue;
    targets.push({ ref, bytes: object.getContents(), width, height });
  }
  return targets;
}

export interface ReencodedJpeg {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/**
 * Swaps a JPEG XObject's stream for the re-encoded version, updating the
 * geometry entries. The RasterCodec always outputs a 3-channel JPEG, so the
 * ColorSpace becomes DeviceRGB regardless of the source space. /Length is
 * recomputed by pdf-lib on save (PDFStream.updateDict), not set here.
 */
export function replaceJpegXObject(
  doc: PDFDocument,
  target: JpegXObjectTarget,
  jpeg: ReencodedJpeg,
): void {
  const original = doc.context.lookup(target.ref);
  if (!(original instanceof PDFRawStream)) {
    throw new Error(`Ref ${target.ref.toString()} is no longer a raw stream`);
  }
  const dict = original.dict.clone(doc.context);
  dict.set(PDFName.of("Width"), PDFNumber.of(jpeg.width));
  dict.set(PDFName.of("Height"), PDFNumber.of(jpeg.height));
  dict.set(COLOR_SPACE, PDFName.of("DeviceRGB"));
  dict.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
  dict.set(FILTER, DCT_DECODE);
  dict.delete(PDFName.of("DecodeParms"));
  doc.context.assign(target.ref, PDFRawStream.of(dict, jpeg.bytes));
}
