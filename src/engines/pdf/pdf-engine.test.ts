// @vitest-environment node
// Real end-to-end engine tests: actual mozjpeg re-encode (Node test codec),
// actual qpdf structural pass, actual pdfjs reopen. No mocks -- the T3
// acceptance criterion (>30% gain on a scanned PDF at maximum) is measured.
import { beforeAll, describe, expect, it } from "vitest";
import { PROFILES } from "../../core/profiles";
import { CompressionError } from "../../core/types";
import { createPdfEngine } from "./pdf-engine";
import { createQpdfOptimizer } from "./structural";
import { countPdfPages } from "./page-count";
import { createJsquashNodeCodec } from "../../test/jsquash-node-codec";
import {
  buildEncryptedPdfBytes,
  buildScannedPdfBytes,
  buildTextPdfBytes,
} from "../../test/pdf-fixtures";
import { loadQpdfWasmForNode } from "../../test/qpdf-node";

const engine = createPdfEngine({
  codec: createJsquashNodeCodec(),
  structural: createQpdfOptimizer(loadQpdfWasmForNode),
  countPages: countPdfPages,
});

function pdfFile(bytes: Uint8Array, name: string): File {
  // Copy into a plain ArrayBuffer: File/Blob parts require a non-shared buffer.
  const part = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(part).set(bytes);
  return new File([part], name, { type: "application/pdf" });
}

async function resultPages(blob: Blob): Promise<number> {
  return countPdfPages(new Uint8Array(await blob.arrayBuffer()));
}

let textPdf: Uint8Array;
let scannedPdf: Uint8Array;

beforeAll(async () => {
  textPdf = await buildTextPdfBytes(40);
  scannedPdf = await buildScannedPdfBytes({ pages: 2 });
}, 240_000);

describe("pdf engine", () => {
  it("shrinks a text-only PDF through the structural pass alone", async () => {
    const result = await engine.compress(pdfFile(textPdf, "text.pdf"), PROFILES.light);
    expect(result.bytesBefore).toBe(textPdf.length);
    expect(result.bytesAfter).toBeLessThan(result.bytesBefore);
    expect(result.gainPercent).toBeGreaterThan(0);
    expect(result.isEstimate).toBe(false);
    expect(result.sampled).toBe(false);
    await expect(resultPages(result.blob)).resolves.toBe(40);
  }, 120_000);

  it("gains more than 30% on a scanned PDF at maximum (T3 acceptance)", async () => {
    const result = await engine.compress(pdfFile(scannedPdf, "scan.pdf"), PROFILES.maximum);
    expect(result.gainPercent).toBeGreaterThan(30);
    expect(result.blob.type).toBe("application/pdf");
    await expect(resultPages(result.blob)).resolves.toBe(2);
  }, 240_000);

  it("also shrinks the scanned PDF at balanced", async () => {
    const result = await engine.compress(pdfFile(scannedPdf, "scan.pdf"), PROFILES.balanced);
    expect(result.gainPercent).toBeGreaterThan(0);
    await expect(resultPages(result.blob)).resolves.toBe(2);
  }, 240_000);

  it("rejects an encrypted PDF with a typed password-protected error", async () => {
    const encrypted = await buildEncryptedPdfBytes();
    try {
      await engine.compress(pdfFile(encrypted, "locked.pdf"), PROFILES.light);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(CompressionError);
      expect((error as CompressionError).code).toBe("password-protected");
    }
  }, 120_000);

  it("rejects garbage bytes with a typed corrupted-file error", async () => {
    const garbage = pdfFile(new Uint8Array([1, 2, 3, 4, 5]), "garbage.pdf");
    try {
      await engine.compress(garbage, PROFILES.light);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(CompressionError);
      expect((error as CompressionError).code).toBe("corrupted-file");
    }
  });

  it("never returns a bigger file than the input", async () => {
    // On a tiny document qpdf's fixed overhead can exceed its savings; the
    // engine must then fall back to the original bytes (0% gain).
    const tiny = await buildTextPdfBytes(1);
    const result = await engine.compress(pdfFile(tiny, "tiny.pdf"), PROFILES.light);
    expect(result.bytesAfter).toBeLessThanOrEqual(result.bytesBefore);
    expect(result.gainPercent).toBeGreaterThanOrEqual(0);
  }, 120_000);
});
