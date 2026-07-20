// Bilingual message catalog for the full compression UI (T5). Both locales
// share the same key set, enforced structurally by the Record type below.
export const SUPPORTED_LOCALES = ["fr", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** localStorage key persisting the user's explicit language choice. */
export const LOCALE_STORAGE_KEY = "compresseur-local:locale";

const fr = {
  "app.title": "Compresseur local",
  "app.tagline": "Compressez images, PDF et fichiers Office directement dans votre navigateur.",
  "app.localBanner":
    "100% local : vos fichiers ne quittent jamais votre appareil. Aucun envoi, aucun serveur.",
  "hero.title1": "Compressez vos fichiers,",
  "hero.title2": "sans rien envoyer.",
  "nav.home": "Accueil",
  "nav.privacy": "Pourquoi 100% local",
  "nav.licenses": "Licences tierces",

  "dropzone.title": "Déposez vos fichiers ici",
  "dropzone.hint": "ou cliquez pour parcourir, ou collez-les depuis le presse-papiers",
  "dropzone.hintActive": "Relâchez pour ajouter vos fichiers",
  "dropzone.browseLabel": "Parcourir les fichiers à compresser",

  "queue.title": "File de compression",
  "queue.empty":
    "Aucun fichier pour l'instant. Les gains par niveau s'affichent dès le dépôt, avant tout téléchargement.",
  "queue.globalLevelLabel": "Niveau pour tous les fichiers",
  "queue.downloadAllZip": "Tout télécharger (ZIP)",
  "queue.zipWorking": "Préparation du ZIP...",
  "queue.clear": "Vider la liste",
  "queue.customBadge": "réglages personnalisés",

  "level.light": "Léger",
  "level.balanced": "Équilibré",
  "level.maximum": "Maximal",
  "level.light.desc": "Qualité quasi intacte",
  "level.balanced.desc": "Le bon compromis",
  "level.maximum.desc": "Taille minimale",

  "estimate.badge": "estimation",
  "estimate.pendingLabel": "Calcul du gain en cours",
  "estimate.errorCell": "échec",

  "card.download": "Télécharger",
  "card.remove": "Retirer",
  "card.done": "Terminé",
  "card.levelLegend": "Niveau de compression",

  "status.estimating": "Estimation des gains en cours",
  "status.ready": "Estimation terminée, choisissez un niveau",
  "status.compressing": "Compression en cours",
  "status.done": "Fichier compressé téléchargé",
  "status.error": "Échec de la compression",

  "family.image": "Image",
  "family.pdf": "PDF",
  "family.office": "Office",

  "error.unsupported-family":
    "Format non pris en charge. Formats acceptés : PNG, JPG, WebP, AVIF, PDF, DOCX, XLSX, PPTX.",
  "error.engine-not-registered":
    "Le moteur de compression pour ce format n'est pas encore disponible dans cette version.",
  "error.corrupted-file": "Fichier illisible ou corrompu.",
  "error.password-protected": "Fichier protégé par mot de passe, compression impossible.",
  "error.file-too-large": "Fichier trop volumineux pour être traité dans le navigateur.",
  "error.cancelled": "Compression annulée.",
  "error.internal-error": "Erreur interne pendant la compression. Réessayez avec ce fichier.",

  "advanced.title": "Réglages avancés",
  "advanced.note":
    "Ces réglages remplacent les valeurs du niveau choisi pour tous les fichiers. Laissez un champ vide pour garder la valeur du niveau.",
  "advanced.quality": "Qualité image (1 à 100)",
  "advanced.maxDimension": "Dimension maximale (pixels)",
  "advanced.format": "Format de sortie des images",
  "advanced.formatKeep": "Conserver le format d'origine",
  "advanced.apply": "Appliquer et réestimer",
  "advanced.reset": "Réinitialiser",

  "trust.gdpr.title": "Conforme RGPD par design",
  "trust.gdpr.body":
    "Aucune donnée ne transite : la compression s'exécute dans votre navigateur et la politique de sécurité bloque tout envoi.",
  "trust.offline.title": "Fonctionne hors ligne",
  "trust.offline.body":
    "Après le premier chargement, compressez en avion : les moteurs sont mis en cache sur votre appareil.",
  "trust.opensource.title": "Open source (MIT)",
  "trust.opensource.body":
    "Code auditable sur GitHub. Aucun tracker, aucun cookie, aucune inscription.",

  "privacy.title": "Pourquoi 100% local",
  "privacy.back": "Retour à l'accueil",
  "privacy.intro.title": "Vos fichiers restent chez vous",
  "privacy.intro.body":
    "Ce compresseur fonctionne entièrement dans votre navigateur, avec WebAssembly et les API web natives. Aucun fichier n'est jamais envoyé à un serveur, y compris le nôtre.",
  "privacy.local.title": "Compression et estimation 100% locales",
  "privacy.local.body":
    "L'estimation du gain et la compression s'exécutent dans un Web Worker de votre navigateur. Le code de l'application est chargé une seule fois, puis l'outil fonctionne hors ligne : vos documents ne transitent jamais sur le réseau.",
  "privacy.comparison.title": "Contrairement aux compresseurs en ligne",
  "privacy.comparison.body":
    "Les services cloud téléversent vos documents sur des serveurs tiers, même s'ils annoncent les supprimer après quelques heures. Pour un document sensible (juridique, comptable, médical, RH), le fichier a tout de même quitté votre appareil. Ici, ce risque n'existe pas : il n'y a rien à téléverser.",
  "privacy.data.title": "Aucune donnée personnelle collectée",
  "privacy.data.body":
    "Pas de compte, pas de base de données, pas d'analytics tiers, pas de cookies. Seule votre préférence de langue est conservée, localement, dans votre navigateur.",

  "footer.brand": "Custom Digital Services",
  "footer.source": "Code source",

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
  "hero.title1": "Compress your files,",
  "hero.title2": "without uploading anything.",
  "nav.home": "Home",
  "nav.privacy": "Why 100% local",
  "nav.licenses": "Third-party licenses",

  "dropzone.title": "Drop your files here",
  "dropzone.hint": "or click to browse, or paste them from the clipboard",
  "dropzone.hintActive": "Release to add your files",
  "dropzone.browseLabel": "Browse files to compress",

  "queue.title": "Compression queue",
  "queue.empty":
    "No files yet. Per-level savings appear as soon as you drop a file, before any download.",
  "queue.globalLevelLabel": "Level for all files",
  "queue.downloadAllZip": "Download all (ZIP)",
  "queue.zipWorking": "Preparing ZIP...",
  "queue.clear": "Clear list",
  "queue.customBadge": "custom settings",

  "level.light": "Light",
  "level.balanced": "Balanced",
  "level.maximum": "Maximum",
  "level.light.desc": "Nearly intact quality",
  "level.balanced.desc": "The sweet spot",
  "level.maximum.desc": "Smallest size",

  "estimate.badge": "estimate",
  "estimate.pendingLabel": "Computing savings",
  "estimate.errorCell": "failed",

  "card.download": "Download",
  "card.remove": "Remove",
  "card.done": "Done",
  "card.levelLegend": "Compression level",

  "status.estimating": "Estimating savings",
  "status.ready": "Estimates ready, pick a level",
  "status.compressing": "Compressing",
  "status.done": "Compressed file downloaded",
  "status.error": "Compression failed",

  "family.image": "Image",
  "family.pdf": "PDF",
  "family.office": "Office",

  "error.unsupported-family":
    "Unsupported format. Accepted formats: PNG, JPG, WebP, AVIF, PDF, DOCX, XLSX, PPTX.",
  "error.engine-not-registered":
    "The compression engine for this format is not available yet in this version.",
  "error.corrupted-file": "Unreadable or corrupted file.",
  "error.password-protected": "Password-protected file, compression impossible.",
  "error.file-too-large": "File too large to process in the browser.",
  "error.cancelled": "Compression cancelled.",
  "error.internal-error": "Internal error during compression. Try this file again.",

  "advanced.title": "Advanced settings",
  "advanced.note":
    "These settings override the chosen level's values for every file. Leave a field empty to keep the level's value.",
  "advanced.quality": "Image quality (1 to 100)",
  "advanced.maxDimension": "Maximum dimension (pixels)",
  "advanced.format": "Image output format",
  "advanced.formatKeep": "Keep original format",
  "advanced.apply": "Apply and re-estimate",
  "advanced.reset": "Reset",

  "trust.gdpr.title": "GDPR-compliant by design",
  "trust.gdpr.body":
    "No data leaves your device: compression runs in your browser and the security policy blocks any upload.",
  "trust.offline.title": "Works offline",
  "trust.offline.body":
    "After the first load, compress on a plane: the engines are cached on your device.",
  "trust.opensource.title": "Open source (MIT)",
  "trust.opensource.body": "Auditable code on GitHub. No tracker, no cookie, no sign-up.",

  "privacy.title": "Why 100% local",
  "privacy.back": "Back to home",
  "privacy.intro.title": "Your files stay with you",
  "privacy.intro.body":
    "This compressor runs entirely in your browser, using WebAssembly and native web APIs. No file is ever sent to a server, including ours.",
  "privacy.local.title": "100% local compression and estimates",
  "privacy.local.body":
    "Both the savings estimate and the compression run inside a Web Worker in your browser. The application code is loaded once, then the tool works offline: your documents never travel over the network.",
  "privacy.comparison.title": "Unlike online compressors",
  "privacy.comparison.body":
    "Cloud services upload your documents to third-party servers, even if they claim to delete them after a few hours. For a sensitive document (legal, accounting, medical, HR), the file still left your device. Here, that risk does not exist: there is nothing to upload.",
  "privacy.data.title": "No personal data collected",
  "privacy.data.body":
    "No account, no database, no third-party analytics, no cookies. Only your language preference is stored, locally, in your browser.",

  "footer.brand": "Custom Digital Services",
  "footer.source": "Source code",

  "licenses.title": "Third-party licenses",
  "licenses.intro":
    "This compressor is built on the following open source libraries. The product itself is MIT licensed.",
  "licenses.columnLibrary": "Library",
  "licenses.columnLicense": "License",
  "licenses.back": "Back to home",
};

export const messages: Record<Locale, Record<MessageKey, string>> = { fr, en };

function isLocale(value: string | null): value is Locale {
  return value === "fr" || value === "en";
}

/**
 * Resolution order: explicit choice persisted in localStorage, then the
 * browser language, then English. localStorage access is wrapped because it
 * throws in some private-browsing modes; the app must still boot there.
 */
export function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage unavailable: fall through to the navigator language.
  }
  const nav = typeof navigator === "undefined" ? "" : navigator.language.toLowerCase();
  return nav.startsWith("fr") ? "fr" : "en";
}

/** Best-effort persistence of an explicit language choice. */
export function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage unavailable: the choice simply lasts for the session.
  }
}
