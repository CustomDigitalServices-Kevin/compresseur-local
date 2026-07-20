import { PDFDocument } from "pdf-lib";
import type { CompressionEngine } from "../../core/engine";
import type { CompressionProfile, CompressionResult } from "../../core/types";
import { CompressionError } from "../../core/types";
import type { RasterCodec, SourceDimensions } from "../image/raster-codec";
import { computeGain, computeTargetDimensions, qualityToUnit } from "../image/plan";
import { pdfMaxDimension } from "./plan";
import type { JpegXObjectTarget, ReencodedJpeg } from "./jpeg-xobjects";
import { collectJpegXObjects, replaceJpegXObject } from "./jpeg-xobjects";
import type { StructuralOptimizer } from "./structural";

// PDF compression engine (T3): re-encode/downsample the embedded JPEG images
// through the shared RasterCodec seam, then run the qpdf structural pass.
// Every profile level runs both passes; at light the image pass re-encodes at
// q85 without resizing (the level cap is undefined, see ./plan.ts).

export interface PdfEngineDeps {
  codec: RasterCodec;
  structural: StructuralOptimizer;
  /** Reopens `bytes` with pdfjs and returns the page count; throws if unreadable. */
  countPages: (bytes: Uint8Array) => Promise<number>;
}

// pdf-lib raises a plain Error whose instanceof does not survive its dual
// CJS/ESM packaging (verified 2026-07-20), so encryption is detected on the
// stable message: "Input document to `PDFDocument.load` is encrypted".
function isEncryptedLoadError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("is encrypted");
}

async function loadDocument(data: ArrayBuffer): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(data, { updateMetadata: false });
  } catch (error) {
    if (isEncryptedLoadError(error)) {
      throw new CompressionError(
        "password-protected",
        "The PDF is encrypted; remove its password before compressing.",
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new CompressionError("corrupted-file", `Failed to parse PDF: ${detail}`);
  }
}

/** Copies bytes into a standalone, non-shared ArrayBuffer (codec + Blob input). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Always copy into a fresh ArrayBuffer: the source view may be an offset
  // window over a larger (or shared) buffer -- same class of bug as Node's
  // Buffer pool slices -- and Blob/codec inputs require a plain ArrayBuffer.
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function reencodeTarget(
  codec: RasterCodec,
  target: JpegXObjectTarget,
  quality: number,
  maxDimension: number | undefined,
): Promise<ReencodedJpeg | null> {
  const captured: { dims: SourceDimensions | null } = { dims: null };
  let blob: Blob;
  try {
    blob = await codec.reencode(toArrayBuffer(target.bytes), "image/jpeg", (dims) => {
      const targetDims = computeTargetDimensions(dims, maxDimension);
      captured.dims = targetDims;
      return {
        targetWidth: targetDims.width,
        targetHeight: targetDims.height,
        mimeType: "image/jpeg",
        quality,
      };
    });
  } catch {
    // Per-image fallback, by design: one undecodable JPEG must not fail the
    // whole document. The image is left exactly as it was (the file stays
    // valid); only the achievable gain shrinks.
    return null;
  }
  const dims = captured.dims;
  if (dims === null) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, width: dims.width, height: dims.height };
}

async function compressPdf(
  deps: PdfEngineDeps,
  file: File,
  profile: CompressionProfile,
): Promise<CompressionResult> {
  const data = await file.arrayBuffer();
  const doc = await loadDocument(data);
  const pageCount = doc.getPageCount();
  const quality = qualityToUnit(profile.imageQuality);
  const maxDimension = pdfMaxDimension(profile);

  for (const target of collectJpegXObjects(doc)) {
    const reencoded = await reencodeTarget(deps.codec, target, quality, maxDimension);
    // Only swap when the re-encode actually helped; otherwise keep the original.
    if (reencoded !== null && reencoded.bytes.length < target.bytes.length) {
      replaceJpegXObject(doc, target, reencoded);
    }
  }

  // Object streams are left to qpdf, the single writer of the final structure.
  const saved = await doc.save({ useObjectStreams: false });
  const optimized = await deps.structural.optimize(saved);

  // Never ship a rewrite we cannot reopen: page-count drift means the rewrite
  // broke the document, and failing loudly beats corrupting the user's file.
  const reopenedPages = await deps.countPages(optimized);
  if (reopenedPages !== pageCount) {
    throw new CompressionError(
      "internal-error",
      `Rewritten PDF has ${reopenedPages.toString()} pages, expected ${pageCount.toString()}`,
    );
  }

  const bytesBefore = file.size;
  // Never hand back a bigger file (qpdf overhead can exceed the savings on
  // tiny inputs): fall back to the original bytes and report 0% gain.
  const payload = optimized.byteLength >= bytesBefore ? new Uint8Array(data) : optimized;
  const blob = new Blob([toArrayBuffer(payload)], { type: "application/pdf" });
  return {
    bytesBefore,
    bytesAfter: blob.size,
    gainPercent: computeGain(bytesBefore, blob.size),
    blob,
    isEstimate: false,
    sampled: false,
  };
}

export function createPdfEngine(deps: PdfEngineDeps): CompressionEngine {
  return {
    compress: (file, profile) => compressPdf(deps, file, profile),
    // No estimate() on purpose: the core estimator falls back to compress().
    // v1 does not sample PDFs because the runtime is dominated by re-encoding
    // the embedded images, whose count and pixel area are bounded by the page
    // count/size, and the qpdf structural pass is fast -- so a real compression
    // is affordable and doubles as an exact (isEstimate: false) figure.
  };
}
