import { expect, test } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { ensureFixtures } from "./fixtures";
import type { FixturePaths } from "./fixtures";
import {
  addFile,
  downloadResult,
  gainPercent,
  openApp,
  selectLevel,
  sniffFormat,
  waitForEstimate,
} from "./helpers";

// The embedded photo is a real q92 JPEG of noisy pixels, not a synthetic
// gradient: deflate cannot shrink it inside the zip, so the gain measured here
// comes from re-encoding the image, which is what the reported number must mean
// (reserve raised by the mcp teammate on the earlier -70% figure).
//
// All three OOXML kinds are covered end to end because acceptance criterion 1
// names them individually; they share ooxml.ts but each has its own media
// directory and its own content parts to leave untouched.
interface OfficeCase {
  kind: keyof Pick<FixturePaths, "docx" | "xlsx" | "pptx">;
  downloadName: string;
  mediaPath: string;
  /** Parts the engine must copy through byte for byte. */
  contentParts: readonly string[];
}

const CASES: readonly OfficeCase[] = [
  {
    kind: "docx",
    downloadName: "report-min.docx",
    mediaPath: "word/media/image1.jpeg",
    contentParts: ["word/document.xml"],
  },
  {
    kind: "xlsx",
    downloadName: "book-min.xlsx",
    mediaPath: "xl/media/image1.jpeg",
    contentParts: ["xl/workbook.xml", "xl/worksheets/sheet1.xml"],
  },
  {
    kind: "pptx",
    downloadName: "deck-min.pptx",
    mediaPath: "ppt/media/image1.jpeg",
    contentParts: ["ppt/presentation.xml", "ppt/slides/slide1.xml"],
  },
];

function partOf(entries: Record<string, Uint8Array>, path: string): Uint8Array {
  const part = entries[path];
  if (part === undefined) throw new Error(`missing part ${path}`);
  return part;
}

for (const officeCase of CASES) {
  test(`compresses a real ${officeCase.kind.toUpperCase()} into a still-valid package`, async ({
    page,
  }) => {
    const fixtures = await ensureFixtures();
    const source = fixtures[officeCase.kind];
    const before = (await stat(source)).size;
    const sourceEntries = unzipSync(new Uint8Array(await readFile(source)));

    await openApp(page);
    await addFile(page, source);
    await waitForEstimate(page, "maximum");
    await selectLevel(page, "maximum");

    const output = await downloadResult(page);
    const gain = gainPercent(before, output.bytes.length);
    console.log(
      `[e2e] ${officeCase.kind.toUpperCase()} maximum: ${String(before)} -> ${String(output.bytes.length)} bytes (${gain.toFixed(1)}% gain), name=${output.name}`,
    );

    expect(sniffFormat(output.bytes)).toBe("zip");
    expect(output.name).toBe(officeCase.downloadName);
    expect(output.bytes.length).toBeLessThan(before);
    expect(gain).toBeGreaterThan(0);

    // Re-openable: the package must still unzip and keep its OPC skeleton.
    const entries = unzipSync(new Uint8Array(output.bytes));
    const names = Object.keys(entries);
    expect(names).toContain("[Content_Types].xml");
    expect(names).toContain("_rels/.rels");
    expect(names).toContain(officeCase.mediaPath);

    // Content parts must be byte-identical: only media is re-encoded.
    for (const part of officeCase.contentParts) {
      expect(names).toContain(part);
      expect(strFromU8(partOf(entries, part)), `part ${part} was altered`).toBe(
        strFromU8(partOf(sourceEntries, part)),
      );
    }

    // The gain must come from the embedded photo.
    const imageBefore = partOf(sourceEntries, officeCase.mediaPath).length;
    const imageAfter = partOf(entries, officeCase.mediaPath).length;
    console.log(
      `[e2e] ${officeCase.kind.toUpperCase()} embedded photo: ${String(imageBefore)} -> ${String(imageAfter)} bytes (${gainPercent(imageBefore, imageAfter).toFixed(1)}% gain)`,
    );
    expect(imageAfter).toBeLessThan(imageBefore);
  });
}
