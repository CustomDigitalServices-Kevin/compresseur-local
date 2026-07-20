import type { CompressionFamily } from "./types";

export interface DetectedType {
  family: CompressionFamily;
  /** Concrete input format inside the family (e.g. "png", "pdf", "docx"). */
  format: string;
}

// Magic-byte signatures checked against the first bytes of the file. Extension
// alone is never trusted: a renamed .docx stays a zip container, and a .png
// with jpeg bytes is a jpeg.
const IMAGE_SIGNATURES: Array<{ format: string; bytes: number[]; offset: number }> = [
  { format: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 },
  { format: "jpeg", bytes: [0xff, 0xd8, 0xff], offset: 0 },
];

const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"
const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF" (webp container)
const WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP" at offset 8
const FTYP_AVIF = [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]; // "ftypavif" at offset 4
const PDF = [0x25, 0x50, 0x44, 0x46]; // "%PDF"
// "[Content_Types].xml": the stored file name every OOXML package starts with.
const CONTENT_TYPES = Array.from(new TextEncoder().encode("[Content_Types].xml"));

const OFFICE_EXTENSIONS: Record<string, string> = {
  docx: "docx",
  xlsx: "xlsx",
  pptx: "pptx",
};

function matchesAt(view: Uint8Array, bytes: number[], offset: number): boolean {
  if (view.length < offset + bytes.length) return false;
  return bytes.every((b, i) => view[offset + i] === b);
}

function containsSequence(view: Uint8Array, needle: number[]): boolean {
  const first = needle[0];
  if (first === undefined) return false;
  outer: for (let i = 0; i + needle.length <= view.length; i++) {
    if (view[i] !== first) continue;
    for (let j = 1; j < needle.length; j++) {
      if (view[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/**
 * Detects the family + concrete format from magic bytes, disambiguating OOXML
 * zip containers (docx/xlsx/pptx) by the presence of "[Content_Types].xml" plus
 * the file extension. Returns null for anything the compressor does not handle.
 */
export function detectType(fileName: string, data: ArrayBuffer): DetectedType | null {
  // Scan a generous window: OOXML puts "[Content_Types].xml" in the first local
  // file entry, but a leading data descriptor can push it past the first 64 B.
  const view = new Uint8Array(data.slice(0, 4096));
  const ext = extensionOf(fileName);

  if (matchesAt(view, RIFF, 0) && matchesAt(view, WEBP, 8)) {
    return { family: "image", format: "webp" };
  }
  if (matchesAt(view, FTYP_AVIF, 4)) {
    return { family: "image", format: "avif" };
  }
  for (const sig of IMAGE_SIGNATURES) {
    if (matchesAt(view, sig.bytes, sig.offset)) {
      return { family: "image", format: sig.format };
    }
  }
  if (matchesAt(view, PDF, 0)) {
    return { family: "pdf", format: "pdf" };
  }
  if (matchesAt(view, ZIP_LOCAL_HEADER, 0)) {
    // A zip is only an Office file if it carries the OOXML content-types part.
    if (containsSequence(view, CONTENT_TYPES)) {
      return { family: "office", format: OFFICE_EXTENSIONS[ext] ?? "ooxml" };
    }
    // Plain zip: not a compressible family here.
    return null;
  }
  return null;
}
