import { PDFDocument, StandardFonts } from "pdf-lib";
import type { SourceDimensions } from "../engines/image/raster-codec";
import { createQpdfRunner } from "../engines/pdf/structural";
import { encodeRgbaToJpeg } from "./jsquash-node-codec";
import { loadQpdfWasmForNode } from "./qpdf-node";

// Programmatic PDF fixtures (no binaries committed): a vector-text document
// for the structural-gain path, a synthetic "scanned" document (full-page
// high-resolution JPEGs) for the >30% acceptance criterion, and a
// qpdf-encrypted document for the password-protected path (pdf-lib cannot
// encrypt on save, qpdf can).

const A4: readonly [number, number] = [595, 842];

/** Multi-page vector text document, saved without object streams so the qpdf
 * structural pass has real repacking work to do. */
export async function buildTextPdfBytes(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([...A4]);
    page.setFont(font);
    page.setFontSize(11);
    for (let y = 800; y > 40; y -= 14) {
      page.drawText(`The quick brown fox jumps over the lazy dog ${i.toString()} ${y.toString()}`, {
        x: 40,
        y,
      });
    }
  }
  return doc.save({ useObjectStreams: false });
}

/** Deterministic PRNG (mulberry32) so fixture sizes are stable across runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthetic scanned-page pixels: paper-like gradient background, dark
 * text-like line blocks, and per-pixel sensor noise. The noise keeps the
 * high-resolution q92 source honestly heavy (like a real scan) while the
 * text/gradient structure keeps it JPEG-compressible after downsampling.
 */
export function synthScanPageRgba(
  dims: SourceDimensions,
  seed: number,
): Uint8ClampedArray<ArrayBuffer> {
  const rand = mulberry32(seed);
  const { width, height } = dims;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const rowShade = 235 + Math.round(12 * Math.sin((y / height) * Math.PI));
    // Simulated text lines: every ~90px band contains a 40px "line" of glyphs.
    const inTextLine = y % 90 < 40;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let value = rowShade;
      if (inTextLine && x > width * 0.08 && x < width * 0.92) {
        // Word-ish dark runs with gaps, pseudo-random per position.
        const inGlyph = rand() > 0.45;
        if (inGlyph) value = 30 + Math.round(rand() * 40);
      }
      const noise = Math.round((rand() - 0.5) * 24);
      rgba[i] = value + noise;
      rgba[i + 1] = value + noise;
      rgba[i + 2] = value + Math.round((rand() - 0.5) * 10);
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

export interface ScannedPdfOptions {
  pages: number;
  /** Pixel size of each embedded page image (default: A4 at 300 DPI). */
  imageDims?: SourceDimensions;
}

/** PDF with one full-page high-resolution JPEG per page, like a scanner output. */
export async function buildScannedPdfBytes(options: ScannedPdfOptions): Promise<Uint8Array> {
  const imageDims = options.imageDims ?? { width: 2480, height: 3508 };
  const doc = await PDFDocument.create();
  for (let i = 0; i < options.pages; i++) {
    const rgba = synthScanPageRgba(imageDims, 1000 + i);
    const jpeg = await encodeRgbaToJpeg(rgba, imageDims, 92);
    const image = await doc.embedJpg(jpeg);
    const page = doc.addPage([...A4]);
    page.drawImage(image, { x: 0, y: 0, width: A4[0], height: A4[1] });
  }
  return doc.save({ useObjectStreams: false });
}

/** AES-256 encrypted PDF, produced by qpdf (pdf-lib cannot encrypt on save). */
export async function buildEncryptedPdfBytes(): Promise<Uint8Array> {
  const plain = await buildTextPdfBytes(3);
  const run = createQpdfRunner(loadQpdfWasmForNode);
  return run(["--encrypt", "user-pass", "owner-pass", "256", "--"], plain);
}
