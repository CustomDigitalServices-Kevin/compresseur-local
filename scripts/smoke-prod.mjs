/**
 * Smoke test de production : compresse un vrai fichier sur le site en ligne.
 *
 * Prouve ce qu'aucun test local ne peut prouver : que le bundle DEPLOYE
 * compresse reellement, derriere la CSP et les types MIME du serveur de prod.
 * Trois bugs de production invisibles en local ont ete trouves par ce script
 * le 2026-07-20 (CSP sans wasm-unsafe-eval, code de sortie qpdf 3 rejete,
 * .mjs servi en octet-stream).
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

// On attend la fin du calcul des trois niveaux, pas un simple compte de "%" :
// le slogan "100% local" de la page en contient deja, et les niveaux se
// calculent en sequence.
await page.waitForFunction(
  () => !/Estimation des gains en cours|Estimating/i.test(document.body.innerText),
  null,
  { timeout: 600_000 },
);

// Les gains sont lus dans la carte du fichier (zone du selecteur de niveau),
// jamais dans le texte marketing de la page.
const levels = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("button, [role=radio], label")) {
    const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (/^(Léger|Équilibré|Maximal)\b/.test(txt) && txt.length < 160) {
      out.push(txt);
    }
  }
  return out;
});

console.log("Niveaux proposes :");
for (const l of levels) console.log("  " + l);

let downloaded = null;
const dlButton = page.locator('button:has-text("Télécharger"), a:has-text("Télécharger")').first();
if (await dlButton.count()) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 300_000 }).catch(() => null),
    dlButton.click({ timeout: 20_000 }).catch(() => {}),
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
  console.log("Aucun telechargement declenche (bouton introuvable ou inactif)");
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
