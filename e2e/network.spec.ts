import { expect, test } from "@playwright/test";
import { ensureFixtures } from "./fixtures";
import { addFile, openApp } from "./helpers";

const APP_ORIGIN = "http://localhost:4173";
// Schemes that never touch the network: object URLs for downloads, inline data,
// and the initial blank page.
const LOCAL_SCHEMES = ["blob:", "data:", "about:"];

/**
 * The "100% local" promise, enforced end to end: every family is processed
 * while every single request the page makes is recorded. Anything leaving the
 * app origin fails the test. The CSP (connect-src 'self') is the belt; this is
 * the braces, and it also covers requests a CSP would allow but we do not want.
 */
test("processes every family without a single off-origin request", async ({ page }) => {
  const fixtures = await ensureFixtures();
  const offOrigin: string[] = [];

  page.on("request", (request) => {
    const url = request.url();
    if (LOCAL_SCHEMES.some((scheme) => url.startsWith(scheme))) return;
    if (!url.startsWith(APP_ORIGIN)) offOrigin.push(`${request.method()} ${url}`);
  });

  await openApp(page);
  await addFile(page, fixtures.png);
  await addFile(page, fixtures.jpeg);
  await addFile(page, fixtures.pdf);
  await addFile(page, fixtures.docx);

  // Four cards, each with its three levels really compressed in the worker.
  await expect(page.locator(".file-card")).toHaveCount(4);
  await expect(page.locator(".btn-download:not([disabled])")).toHaveCount(4, { timeout: 150_000 });

  expect(offOrigin, `off-origin requests: ${offOrigin.join(" | ")}`).toEqual([]);
});
