import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Strict CSP injected at build time only (the dev server needs inline scripts
// for HMR). connect-src 'self' is the technical enforcement of the "no upload"
// promise: the browser itself blocks any cross-origin request. wasm-unsafe-eval
// is required by the WASM codecs added in T2-T4.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  // No component ever sets an inline style attribute (see the CSP note at the
  // top of index.css and the D9 comment in FileCard.tsx), so no 'unsafe-inline'
  // and no style-src-attr are needed: everything comes from the stylesheet.
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");

function injectCsp(): Plugin {
  return {
    name: "inject-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

/**
 * Keeps the multi-threaded AVIF encoder out of the bundle entirely (PRD: AVIF
 * single-thread forced, gotcha D8 convertisseur -- the static deployment has no
 * guaranteed COOP/COEP headers, so no SharedArrayBuffer and no pthread workers).
 *
 * Why a bundler-level redirect rather than only forcing init() at runtime:
 * @jsquash/avif 2.1.1's `init()` does NOT short-circuit when the encoder is
 * already initialized -- it re-runs its `threads()` probe on EVERY call and, on
 * a threads-capable browser, imports `./codec/enc/avif_enc_mt.js` regardless of
 * the WebAssembly.Module handed to it (see node_modules/@jsquash/avif/encode.js).
 * Runtime forcing alone is therefore not a guarantee. Redirecting the MT
 * specifier to the single-thread build makes it structural: whichever branch
 * init() takes, it loads the single-thread encoder, and the ~3.5 MB MT chunk
 * plus its nested pthread worker never enter the bundle graph at all (that
 * nested worker also breaks a code-splitting build outright).
 *
 * The oxipng codec needs no equivalent: codec-loaders.ts deep-imports its
 * single-thread `codec/pkg` build directly, so the `codec/pkg-parallel` build
 * is never referenced.
 */
function forceSingleThreadAvif(): Plugin {
  return {
    name: "force-single-thread-avif",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!source.endsWith("avif_enc_mt.js")) return null;
      const singleThread = source.replace("avif_enc_mt.js", "avif_enc.js");
      return await this.resolve(singleThread, importer, { ...options, skipSelf: true });
    },
  };
}

/**
 * Offline PWA. The precache is deliberately limited to the app shell (HTML,
 * CSS and every JS chunk): the heavy binaries are cached at RUNTIME instead.
 *
 * Why: dist/ weighs ~11 MB, dominated by four assets that most visitors never
 * need (avif_enc 3.4 MB and avif_dec 1.1 MB only matter when AVIF is chosen or
 * dropped, pdf.worker 2.3 MB and qpdf 1.2 MB only for PDFs). Precaching them
 * would push ~11 MB onto every first visit. With this split the install
 * payload is the shell only, and each codec is cached the first time it is
 * actually used -- after which that family keeps working offline.
 *
 * maximumFileSizeToCacheInBytes stays at the 2 MiB default on purpose: it is a
 * regression alarm. If a future change lets a multi-megabyte asset match
 * globPatterns, the build fails loudly instead of silently bloating the
 * precache (RAG pwa-vite-plugin-pwa, convertisseur 2026-07-18).
 */
function pwa(): Plugin[] {
  return VitePWA({
    registerType: "autoUpdate",
    // External registerSW.js rather than an inline script: keeps the strict
    // CSP (script-src 'self') intact.
    injectRegister: "script-defer",
    includeAssets: ["icon.svg"],
    workbox: {
      // Shell only. Note .wasm and .mjs are absent by design (see above).
      globPatterns: ["**/*.{js,css,html}"],
      // Take control of the page as soon as the worker activates. Without it
      // the first visit stays uncontrolled until the next navigation, so a
      // reload right after the first load could miss the cache.
      clientsClaim: true,
      runtimeCaching: [
        {
          // Content-hashed and immutable, so CacheFirst is safe: a rebuild
          // produces a new filename rather than mutating this one.
          urlPattern: /\.(?:wasm|mjs)$/,
          handler: "CacheFirst",
          options: {
            cacheName: "compresseur-codecs",
            expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
    manifest: {
      name: "Compresseur local",
      short_name: "Compresseur",
      description: "Compress images, PDF and Office files entirely in your browser. No upload.",
      theme_color: "#ff6b00",
      background_color: "#0b0b0d",
      display: "standalone",
      icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    },
  });
}

// Deployed under /outils/compresseur/ on the CDS site; base must stay relative
// so the same build also works on GitHub Pages or a local preview.
export default defineConfig({
  base: "./",
  plugins: [react(), injectCsp(), forceSingleThreadAvif(), pwa()],
  build: {
    target: "es2022",
    sourcemap: false,
  },
  worker: {
    format: "es",
    // The worker bundle runs through its own plugin pipeline: the plugins above
    // do NOT apply to it. Since the codecs are imported from the worker, the
    // AVIF redirect has to be repeated here, otherwise the ~3.5 MB multi-thread
    // encoder lands back in dist/ and in the PWA precache.
    plugins: () => [forceSingleThreadAvif()],
  },
});
