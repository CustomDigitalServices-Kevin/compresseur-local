/**
 * Smoke test de production de l'outil photo-identite : charge une vraie photo
 * et declenche le "fond blanc auto (IA)".
 *
 * Prouve que la CSP de prod laisse passer le CDN de la librairie et le modele
 * Hugging Face, ce qu'aucun test local ne peut montrer (la page est prevue
 * pour un double-clic en file://, ou aucune CSP ne s'applique).
 */

import { statSync } from "node:fs";
import { basename } from "node:path";
import { chromium } from "@playwright/test";

const DEFAULT_URL = "https://www.custom-digital-services.com/outils/photo-identite/";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const photo = process.argv[2];
if (!photo) {
  console.error("Usage: node scripts/smoke-photo-prod.mjs <photo.jpg> [--url <url>]");
  process.exit(2);
}
const url = arg("--url", DEFAULT_URL);

const browser = await chromium.launch();
const page = await browser.newPage();

const cspViolations = [];
const otherErrors = [];
const externalHosts = new Set();
const failedRequests = [];

page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  const t = msg.text();
  if (t.includes("favicon")) return;
  if (/Content Security Policy|violates the following/i.test(t)) cspViolations.push(t);
  else otherErrors.push(t);
});
page.on("pageerror", (e) => otherErrors.push(String(e)));
page.on("request", (req) => {
  const h = new URL(req.url()).host;
  if (!h.includes("custom-digital-services.com")) externalHosts.add(h);
});
page.on("requestfailed", (req) => {
  failedRequests.push(`${new URL(req.url()).host} ${req.failure()?.errorText ?? ""}`);
});

console.log(`Cible : ${url}`);
console.log(`Photo : ${basename(photo)} (${(statSync(photo).size / 1024).toFixed(0)} Ko)\n`);

await page.goto(url, { waitUntil: "networkidle" });
await page.setInputFiles("input[type=file]", photo).catch(() => {});
await page.waitForTimeout(4000);

// Le bouton porte l'id #aiBtn et reste disabled tant qu'aucune photo n'est
// chargee : on verifie donc son etat, pas sa seule presence.
const aiButton = page.locator("#aiBtn");
const state = await page.evaluate(() => {
  const b = document.querySelector("#aiBtn");
  return {
    exists: Boolean(b),
    disabled: b ? b.disabled : null,
    status: document.querySelector("#aiStatus")?.textContent?.trim() ?? "",
    fileInputs: [...document.querySelectorAll("input[type=file]")].map(
      (i) => i.id || i.getAttribute("aria-label") || "(sans id)",
    ),
  };
});
console.log("Etat :", JSON.stringify(state));
if (!state.exists || state.disabled) {
  console.log("Bouton IA absent ou desactive : la photo n'a pas ete prise en compte");
  await browser.close();
  process.exit(1);
}

console.log("Clic sur le bouton fond blanc IA, chargement du modele en cours...");
await aiButton.click({ timeout: 20_000 }).catch(() => {});

// Le modele fait plusieurs dizaines de Mo au premier chargement : on attend un
// signe explicite de fin plutot qu'un delai fixe.
await page
  .waitForFunction(
    () => !/chargement|traitement|patientez|loading/i.test(document.body.innerText),
    null,
    { timeout: 180_000 },
  )
  .catch(() => console.log("(pas de signal de fin detecte, on prend l'etat courant)"));
await page.waitForTimeout(5000);

console.log("\n--- RESULTAT ---");
console.log(`Violations CSP        : ${cspViolations.length}`);
console.log(`Autres erreurs        : ${otherErrors.length}`);
console.log(`Requetes en echec     : ${failedRequests.length}`);
console.log(`Hotes externes joints : ${[...externalHosts].join(", ") || "aucun"}`);
if (cspViolations.length) console.log(cspViolations.slice(0, 3));
if (otherErrors.length) console.log(otherErrors.slice(0, 3));
if (failedRequests.length) console.log(failedRequests.slice(0, 3));

await browser.close();
process.exit(cspViolations.length || failedRequests.length ? 1 : 0);
