import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import encodePng, { init as initPngEncode } from "@jsquash/png/encode.js";
import { buildScannedPdfBytes, synthScanPageRgba } from "../src/test/pdf-fixtures";
import { encodeRgbaToJpeg } from "../src/test/jsquash-node-codec";
import { buildOoxml } from "../src/test/ooxml-fixtures";
import type { SourceDimensions } from "../src/engines/image/raster-codec";

// E2E fixtures are GENERATED, never committed as binaries: the same pixel
// source (synthScanPageRgba -- paper gradient + text blocks + per-pixel sensor
// noise) feeds every family, so the inputs are entropy-dense like real photos
// and scans. That matters for the Office case in particular: a synthetic
// gradient deflates to almost nothing inside the zip and would report a
// flattering, meaningless gain (reserve raised by the mcp teammate).

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, ".fixtures");
const require = createRequire(import.meta.url);

let pngReady: Promise<void> | undefined;

async function ensurePngReady(): Promise<void> {
  pngReady ??= (async () => {
    // The jsquash glue resolves its wasm relative to import.meta.url, which
    // fails under Node; compile it from node_modules instead (same approach as
    // src/test/jsquash-node-codec.ts).
    const wasm = await WebAssembly.compile(
      await readFile(require.resolve("@jsquash/png/codec/pkg/squoosh_png_bg.wasm")),
    );
    await initPngEncode(wasm);
  })();
  return pngReady;
}

async function encodeRgbaToPng(
  rgba: Uint8ClampedArray<ArrayBuffer>,
  dims: SourceDimensions,
): Promise<Uint8Array> {
  await ensurePngReady();
  // Structurally compatible with ImageData (encode only reads data/width/height);
  // Node has no ImageData constructor, hence the plain literal.
  const imageData: ImageData = {
    data: rgba,
    width: dims.width,
    height: dims.height,
    colorSpace: "srgb",
  };
  return new Uint8Array(await encodePng(imageData));
}

export interface FixturePaths {
  png: string;
  jpeg: string;
  pdf: string;
  docx: string;
  xlsx: string;
  pptx: string;
}

/** Photo-sized source: big enough that the maximum preset's 1920px cap bites. */
const PHOTO_DIMS: SourceDimensions = { width: 2400, height: 1600 };
/** 150 DPI A4, two pages: a realistic scan without a 30 s fixture build. */
const SCAN_DIMS: SourceDimensions = { width: 1240, height: 1754 };

let built: Promise<FixturePaths> | undefined;

/**
 * Generates every fixture once per process and writes it to e2e/.fixtures/
 * (gitignored). Files already on disk are reused, so a re-run is instant.
 */
export function ensureFixtures(): Promise<FixturePaths> {
  built ??= (async (): Promise<FixturePaths> => {
    await mkdir(outDir, { recursive: true });
    const paths: FixturePaths = {
      png: join(outDir, "photo.png"),
      jpeg: join(outDir, "photo.jpg"),
      pdf: join(outDir, "scanned.pdf"),
      docx: join(outDir, "report.docx"),
      xlsx: join(outDir, "book.xlsx"),
      pptx: join(outDir, "deck.pptx"),
    };

    const photoPixels = synthScanPageRgba(PHOTO_DIMS, 42);

    if (!existsSync(paths.png)) {
      await writeFile(paths.png, await encodeRgbaToPng(photoPixels, PHOTO_DIMS));
    }
    if (!existsSync(paths.jpeg)) {
      await writeFile(paths.jpeg, await encodeRgbaToJpeg(photoPixels, PHOTO_DIMS, 92));
    }
    if (!existsSync(paths.pdf)) {
      await writeFile(paths.pdf, await buildScannedPdfBytes({ pages: 2, imageDims: SCAN_DIMS }));
    }
    // A real, noisy q92 JPEG as the embedded photo: deflate cannot shrink it,
    // so any gain reported by the office engine comes from re-encoding the
    // image, not from the zip. The same photo goes into all three packages so
    // their gains are directly comparable.
    const officeTargets = [
      { kind: "docx", path: paths.docx },
      { kind: "xlsx", path: paths.xlsx },
      { kind: "pptx", path: paths.pptx },
    ] as const;
    if (officeTargets.some((target) => !existsSync(target.path))) {
      const embedded = await encodeRgbaToJpeg(photoPixels, PHOTO_DIMS, 92);
      for (const target of officeTargets) {
        if (existsSync(target.path)) continue;
        await writeFile(
          target.path,
          buildOoxml(target.kind, {
            media: { "image1.jpeg": embedded },
            imageDefaults: ["jpeg", "png"],
          }),
        );
      }
    }
    return paths;
  })();
  return built;
}
