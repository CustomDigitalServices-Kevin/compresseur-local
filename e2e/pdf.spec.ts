import { expect, test } from "@playwright/test";
import { stat } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
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

// CRITICAL SMOKE. The @jspawn/qpdf-wasm glue ships Node branches
// (require("fs"/"path"/"crypto")) that Vite externalizes with a warning; they
// are guarded by `if (isNode)` plus a browser shim. Static analysis cannot
// prove those branches stay inert -- only a real PDF compression inside
// Chromium can. Any leak surfaces as a console error ("require is not
// defined", "Dynamic require of ... is not supported", "module is not
// defined"), so this test fails on ANY page error during the run.
test.describe("pdf compression", () => {
  test("compresses a real scanned PDF above 30% with no Node-branch leak", async ({ page }) => {
    const fixtures = await ensureFixtures();
    const before = (await stat(fixtures.pdf)).size;

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    await openApp(page);
    await addFile(page, fixtures.pdf);
    await waitForEstimate(page, "maximum");
    await selectLevel(page, "maximum");

    const output = await downloadResult(page);
    const gain = gainPercent(before, output.bytes.length);
    console.log(
      `[e2e] PDF maximum: ${String(before)} -> ${String(output.bytes.length)} bytes (${gain.toFixed(1)}% gain), name=${output.name}`,
    );

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(" | ")}`).toEqual([]);
    expect(consoleErrors, `console errors: ${consoleErrors.join(" | ")}`).toEqual([]);

    expect(sniffFormat(output.bytes)).toBe("pdf");
    // PRD acceptance criterion 2: >30% on a scanned PDF at the maximum level.
    expect(gain).toBeGreaterThan(30);

    // The result must still be a readable PDF with every page intact.
    const reopened = await PDFDocument.load(output.bytes);
    expect(reopened.getPageCount()).toBe(2);
  });
});
