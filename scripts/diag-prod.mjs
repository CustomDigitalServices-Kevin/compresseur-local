/** Diagnostic : que se passe-t-il reellement apres le depot d'un fichier ? */
import { statSync } from "node:fs";
import { chromium } from "@playwright/test";

const url = "https://www.custom-digital-services.com/outils/compresseur/";
const file = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage();

const errs = [];
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("favicon")) errs.push("CONSOLE " + m.text());
});
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e)));
page.on("requestfailed", (r) => errs.push(`REQFAIL ${r.url()} ${r.failure()?.errorText}`));

await page.goto(url, { waitUntil: "networkidle" });
console.log(`Depot de ${file} (${(statSync(file).size / 1048576).toFixed(2)} Mo)`);
await page.setInputFiles("input[type=file]", file);

for (const s of [5, 15, 30, 60, 120]) {
  await page.waitForTimeout(s === 5 ? 5000 : 10000 * (s > 30 ? 3 : 1));
  const txt = await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, "\n"));
  console.log(`\n===== T+${s}s =====\n${txt.slice(0, 900)}`);
  if (errs.length) {
    console.log("--- ERREURS ---");
    console.log(errs.slice(0, 8).join("\n"));
  }
}
await browser.close();
