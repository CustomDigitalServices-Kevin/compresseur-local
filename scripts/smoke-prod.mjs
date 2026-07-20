/**
 * Smoke test de production : compresse un vrai fichier sur le site en ligne.
 *
 * Verifie de bout en bout ce qu'aucun test local ne prouve : que le bundle
 * deploye compresse reellement, sans erreur console et sans requete sortante.
 *
 * Usage :
 *   node scripts/smoke-prod.mjs "C:/chemin/vers/fichier.pdf"
 *   node scripts/smoke-prod.mjs "fichier.pdf" --url https://.../outils/compresseur/
 */

import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { chromium } from "@playwright/test";

const DEFAULT_URL = "https://www.custom-digital-services.com/outils/compresseur/";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node scripts/smoke-prod.mjs <fichier> [--url <url>]");
  process.exit(2);
}

const url = arg("--url", DEFAULT_URL);
const origin = new URL(url).origin;
const sizeBefore = statSync(filePath).size;

const browser = await chromium.launch();
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
const foreignRequests = [];

page.on("console", (msg) => {
  // Le favicon 404 du site vitrine est hors perimetre de l'outil.
  if (msg.type() === "error" && !msg.text().includes("favicon")) {
    consoleErrors.push(msg.text());
  }
});
page.on("pageerror", (err) => pageErrors.push(String(err)));
page.on("request", (req) => {
  const u = req.url();
  if (!u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:")) {
    foreignRequests.push(u);
  }
});

console.log(`Cible   : ${url}`);
console.log(`Fichier : ${basename(filePath)} (${(sizeBefore / 1024 / 1024).toFixed(2)} Mo)\n`);

await page.goto(url, { waitUntil: "networkidle" });
await page.setInputFiles("input[type=file]", filePath);

// Les trois niveaux se calculent en arriere-plan : on attend que les trois
// pourcentages de gain soient affiches plutot qu'un delai arbitraire.
// Signature Playwright : (fonction, argument, options). Sans le 2e argument,
// les options seraient prises pour l'argument et le timeout par defaut (30 s)
// s'appliquerait, trop court pour un gros PDF.
await page.waitForFunction(
  () => (document.body.innerText.match(/\d+([.,]\d+)?\s?%/g) || []).length >= 3,
  null,
  { timeout: 240_000 },
);

const results = await page.evaluate(() => {
  const text = document.body.innerText;
  return {
    gains: text.match(/\d+([.,]\d+)?\s?%/g) || [],
    hasEstimateBadge: /estimation/i.test(text),
    excerpt: text.slice(0, 1500),
  };
});

console.log("Extrait de la carte :\n" + results.excerpt + "\n");
console.log("Pourcentages affiches :", results.gains.join("  "));
console.log("Badge estimation :", results.hasEstimateBadge ? "oui" : "non (valeurs exactes)");

let downloaded = null;
const maxButton = page.getByRole("button", { name: /maximal/i }).first();
if (await maxButton.count()) {
  await maxButton.click().catch(() => {});
  await page.waitForTimeout(1500);
}
const dlButton = page.getByRole("button", { name: /télécharger|download/i }).first();
if (await dlButton.count()) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 180_000 }).catch(() => null),
    dlButton.click().catch(() => {}),
  ]);
  if (download) {
    const target = `${process.env.TEMP || "/tmp"}/${download.suggestedFilename()}`;
    await download.saveAs(target);
    const sizeAfter = statSync(target).size;
    const head = readFileSync(target).subarray(0, 5).toString("latin1");
    downloaded = {
      name: download.suggestedFilename(),
      sizeAfter,
      gain: (((sizeBefore - sizeAfter) / sizeBefore) * 100).toFixed(1),
      isPdf: head === "%PDF-",
      path: target,
    };
  }
}

console.log("\n--- RESULTAT ---");
if (downloaded) {
  console.log(`Fichier telecharge : ${downloaded.name}`);
  console.log(`Avant  : ${sizeBefore.toLocaleString("fr-FR")} octets`);
  console.log(`Apres  : ${downloaded.sizeAfter.toLocaleString("fr-FR")} octets`);
  console.log(`Gain   : ${downloaded.gain} %`);
  console.log(`En-tete PDF valide : ${downloaded.isPdf ? "oui" : "NON"}`);
  console.log(`Copie locale : ${downloaded.path}`);
} else {
  console.log("Aucun telechargement declenche (bouton introuvable)");
}
console.log(`Erreurs console : ${consoleErrors.length}`);
console.log(`Erreurs page    : ${pageErrors.length}`);
console.log(`Requetes hors origine : ${foreignRequests.length}`);
if (consoleErrors.length) console.log(consoleErrors.slice(0, 5));
if (pageErrors.length) console.log(pageErrors.slice(0, 5));
if (foreignRequests.length) console.log(foreignRequests.slice(0, 5));

await browser.close();

const failed =
  consoleErrors.length > 0 ||
  pageErrors.length > 0 ||
  foreignRequests.length > 0 ||
  !downloaded ||
  !downloaded.isPdf;
process.exit(failed ? 1 : 0);
