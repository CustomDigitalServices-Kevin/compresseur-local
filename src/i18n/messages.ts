// Minimal bilingual message catalog. T1 only needs the shell + licenses page
// strings; T5 fills in the full compression UI. Both locales share the same key
// set (enforced structurally by the Record type below).
export const SUPPORTED_LOCALES = ["fr", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const fr = {
  "app.title": "Compresseur local",
  "app.tagline": "Compressez images, PDF et fichiers Office directement dans votre navigateur.",
  "app.localBanner":
    "100% local : vos fichiers ne quittent jamais votre appareil. Aucun envoi, aucun serveur.",
  "nav.home": "Accueil",
  "nav.licenses": "Licences tierces",
  "licenses.title": "Licences tierces",
  "licenses.intro":
    "Ce compresseur s'appuie sur les bibliothèques open source suivantes. Le produit est distribué sous licence MIT.",
  "licenses.columnLibrary": "Bibliothèque",
  "licenses.columnLicense": "Licence",
  "licenses.back": "Retour à l'accueil",
} as const;

export type MessageKey = keyof typeof fr;

const en: Record<MessageKey, string> = {
  "app.title": "Local compressor",
  "app.tagline": "Compress images, PDF and Office files right inside your browser.",
  "app.localBanner": "100% local: your files never leave your device. No upload, no server.",
  "nav.home": "Home",
  "nav.licenses": "Third-party licenses",
  "licenses.title": "Third-party licenses",
  "licenses.intro":
    "This compressor is built on the following open source libraries. The product itself is MIT licensed.",
  "licenses.columnLibrary": "Library",
  "licenses.columnLicense": "License",
  "licenses.back": "Back to home",
};

export const messages: Record<Locale, Record<MessageKey, string>> = { fr, en };

export function detectLocale(): Locale {
  const nav = typeof navigator === "undefined" ? "" : navigator.language.toLowerCase();
  return nav.startsWith("fr") ? "fr" : "en";
}
