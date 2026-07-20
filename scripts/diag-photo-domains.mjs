/**
 * Capture les domaines REELLEMENT contactes par la lib IA de photo-identite,
 * au lieu de deviner la whitelist CSP.
 *
 * On declenche le meme chargement que le bouton "fond blanc IA" (import du
 * module depuis le CDN puis from_pretrained du modele), sur la page servie en
 * http local ou aucune CSP n'interfere : on observe donc l'intention reelle du
 * code, pas ce que la prod autorise.
 */
import { chromium } from "@playwright/test";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/diag-photo-domains.mjs <url http de la page>");
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const hosts = new Map();

page.on("request", (req) => {
  const u = new URL(req.url());
  if (u.protocol === "data:" || u.protocol === "blob:") return;
  if (!hosts.has(u.host)) hosts.set(u.host, new Set());
  hosts.get(u.host).add(u.pathname.slice(0, 70));
});

await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});

const outcome = await page.evaluate(async () => {
  try {
    const mod = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0");
    mod.env.allowLocalModels = false;
    // remoteHost est la valeur qui decide ou les poids sont telecharges.
    const host = mod.env.remoteHost ?? "(non expose)";
    // On lance le chargement du modele et on laisse filer les requetes ; peu
    // importe qu'il aboutisse, seules les URL contactees nous interessent.
    const load = mod
      .pipeline("background-removal", "Xenova/modnet")
      .catch((e) => String(e).slice(0, 120));
    await Promise.race([load, new Promise((r) => setTimeout(r, 25_000))]);
    return { remoteHost: host };
  } catch (err) {
    return { error: String(err).slice(0, 200) };
  }
});

console.log("Config lib :", JSON.stringify(outcome));
console.log("\n--- HOTES CONTACTES ---");
for (const [host, paths] of hosts) {
  console.log(host);
  for (const p of [...paths].slice(0, 3)) console.log("    " + p);
}
await browser.close();
