import { expect, test } from "@playwright/test";
import { stat } from "node:fs/promises";
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

/**
 * PWA offline proof. The precache holds the shell only, so the flow is:
 * first visit online (which runtime-caches the image codecs on first real use),
 * then go offline, reload, and compress again. A second successful compression
 * with the network cut is what proves both the precached shell and the
 * runtime-cached WASM are serving from the service worker.
 */
test("still compresses after a reload with the network cut", async ({ page, context }) => {
  const fixtures = await ensureFixtures();
  const before = (await stat(fixtures.jpeg)).size;

  await openApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  // Online run: pulls the image codecs into the runtime cache.
  await addFile(page, fixtures.jpeg);
  await waitForEstimate(page, "maximum");
  await selectLevel(page, "maximum");
  const online = await downloadResult(page);
  expect(online.bytes.length).toBeLessThan(before);

  await context.setOffline(true);
  await page.reload();

  // The shell itself must come from the precache.
  await expect(page.getByTestId("dropzone")).toBeVisible();

  await addFile(page, fixtures.jpeg);
  await waitForEstimate(page, "maximum");
  await selectLevel(page, "maximum");
  const offline = await downloadResult(page);
  const gain = gainPercent(before, offline.bytes.length);
  console.log(
    `[e2e] JPEG maximum OFFLINE: ${String(before)} -> ${String(offline.bytes.length)} bytes (${gain.toFixed(1)}% gain)`,
  );

  expect(sniffFormat(offline.bytes)).toBe("jpeg");
  expect(offline.bytes.length).toBeLessThan(before);
  // Offline output must match the online one byte for byte: same codec, same
  // settings, served from cache.
  expect(offline.bytes.length).toBe(online.bytes.length);
});
