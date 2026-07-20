/** Verifie si WebAssembly peut s'instancier sur une page donnee (CSP). */
import { chromium } from "@playwright/test";

const urls = process.argv.slice(2);
const browser = await chromium.launch();

for (const url of urls) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
  // Module WASM minimal valide (magic + version), suffisant pour declencher
  // le refus CSP sans dependre d'un binaire du site.
  const result = await page.evaluate(async () => {
    const bytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    try {
      await WebAssembly.compile(bytes);
      return "OK";
    } catch (err) {
      return String(err).slice(0, 160);
    }
  });
  console.log(`${result === "OK" ? "WASM OK  " : "WASM KO  "} ${url}`);
  if (result !== "OK") console.log(`           ${result}`);
  await page.close();
}
await browser.close();
