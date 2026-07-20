import { expect, test } from "@playwright/test";
import { stat } from "node:fs/promises";
import { ensureFixtures } from "./fixtures";
import {
  addFile,
  decodeInBrowser,
  downloadResult,
  gainPercent,
  openApp,
  selectLevel,
  sniffFormat,
  waitForEstimate,
} from "./helpers";

test.describe("image compression", () => {
  test("compresses a real JPEG photo and the output decodes in the browser", async ({ page }) => {
    const fixtures = await ensureFixtures();
    const before = (await stat(fixtures.jpeg)).size;

    await openApp(page);
    await addFile(page, fixtures.jpeg);
    await waitForEstimate(page, "maximum");
    await selectLevel(page, "maximum");

    const output = await downloadResult(page);
    const gain = gainPercent(before, output.bytes.length);
    console.log(
      `[e2e] JPEG maximum: ${String(before)} -> ${String(output.bytes.length)} bytes (${gain.toFixed(1)}% gain), name=${output.name}, format=${sniffFormat(output.bytes)}`,
    );

    expect(sniffFormat(output.bytes)).toBe("jpeg");
    expect(output.name).toBe("photo-min.jpg");
    expect(output.bytes.length).toBeLessThan(before);
    expect(gain).toBeGreaterThan(0);

    const decoded = await decodeInBrowser(page, output.bytes);
    // The maximum preset caps the longest side at 1920 (source is 2400x1600).
    expect(decoded.width).toBe(1920);
    expect(decoded.height).toBe(1280);
  });

  test("compresses a real PNG photo and the output decodes in the browser", async ({ page }) => {
    const fixtures = await ensureFixtures();
    const before = (await stat(fixtures.png)).size;

    await openApp(page);
    await addFile(page, fixtures.png);
    await waitForEstimate(page, "maximum");
    await selectLevel(page, "maximum");

    const output = await downloadResult(page);
    const format = sniffFormat(output.bytes);
    const gain = gainPercent(before, output.bytes.length);
    console.log(
      `[e2e] PNG maximum: ${String(before)} -> ${String(output.bytes.length)} bytes (${gain.toFixed(1)}% gain), name=${output.name}, format=${format}`,
    );

    // PNG at maximum is re-encoded to lossy WebP (plan.ts selectOutputMime),
    // so the download must be named .webp -- not .png with WebP bytes inside.
    expect(format).toBe("webp");
    expect(output.name).toBe("photo-min.webp");
    expect(output.bytes.length).toBeLessThan(before);
    expect(gain).toBeGreaterThan(0);

    const decoded = await decodeInBrowser(page, output.bytes);
    expect(decoded.width).toBe(1920);
    expect(decoded.height).toBe(1280);
  });

  test("keeps PNG lossless at the light level", async ({ page }) => {
    const fixtures = await ensureFixtures();
    const before = (await stat(fixtures.png)).size;

    await openApp(page);
    await addFile(page, fixtures.png);
    await waitForEstimate(page, "light");
    await selectLevel(page, "light");

    const output = await downloadResult(page);
    const gain = gainPercent(before, output.bytes.length);
    console.log(
      `[e2e] PNG light: ${String(before)} -> ${String(output.bytes.length)} bytes (${gain.toFixed(1)}% gain), format=${sniffFormat(output.bytes)}`,
    );

    expect(sniffFormat(output.bytes)).toBe("png");
    expect(output.name).toBe("photo-min.png");
    const decoded = await decodeInBrowser(page, output.bytes);
    // Lossless path: full resolution preserved.
    expect(decoded.width).toBe(2400);
    expect(decoded.height).toBe(1600);
  });
});
