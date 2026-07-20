import { expect, test } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { ensureFixtures } from "./fixtures";
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
test.describe("office compression", () => {
  test("compresses a real DOCX and the result is still a valid package", async ({ page }) => {
    const fixtures = await ensureFixtures();
    const before = (await stat(fixtures.docx)).size;
    const sourceEntries = unzipSync(new Uint8Array(await readFile(fixtures.docx)));
    const sourceImage = sourceEntries["word/media/image1.jpeg"];
    const sourceDocument = sourceEntries["word/document.xml"];
    expect(sourceImage).toBeDefined();
    expect(sourceDocument).toBeDefined();

    await openApp(page);
    await addFile(page, fixtures.docx);
    await waitForEstimate(page, "maximum");
    await selectLevel(page, "maximum");

    const output = await downloadResult(page);
    const gain = gainPercent(before, output.bytes.length);
    console.log(
      `[e2e] DOCX maximum: ${String(before)} -> ${String(output.bytes.length)} bytes (${gain.toFixed(1)}% gain), name=${output.name}`,
    );

    expect(sniffFormat(output.bytes)).toBe("zip");
    expect(output.bytes.length).toBeLessThan(before);
    expect(gain).toBeGreaterThan(0);

    // Re-openable: the package must still unzip and keep its OPC parts.
    const entries = unzipSync(new Uint8Array(output.bytes));
    const names = Object.keys(entries);
    expect(names).toContain("[Content_Types].xml");
    expect(names).toContain("_rels/.rels");
    expect(names).toContain("word/document.xml");
    expect(names).toContain("word/media/image1.jpeg");

    // Content parts must be byte-identical: only media is re-encoded.
    const outputDocument = entries["word/document.xml"];
    expect(outputDocument).toBeDefined();
    expect(strFromU8(outputDocument as Uint8Array)).toBe(strFromU8(sourceDocument as Uint8Array));

    // The gain must come from the embedded photo.
    const outputImage = entries["word/media/image1.jpeg"];
    expect(outputImage).toBeDefined();
    const imageBefore = (sourceImage as Uint8Array).length;
    const imageAfter = (outputImage as Uint8Array).length;
    console.log(
      `[e2e] DOCX embedded photo: ${String(imageBefore)} -> ${String(imageAfter)} bytes (${gainPercent(imageBefore, imageAfter).toFixed(1)}% gain)`,
    );
    expect(imageAfter).toBeLessThan(imageBefore);
  });
});
