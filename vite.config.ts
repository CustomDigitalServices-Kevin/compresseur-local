import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Strict CSP injected at build time only (the dev server needs inline scripts
// for HMR). connect-src 'self' is the technical enforcement of the "no upload"
// promise: the browser itself blocks any cross-origin request. wasm-unsafe-eval
// is required by the WASM codecs added in T2-T4.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
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

// Deployed under /outils/compresseur/ on the CDS site; base must stay relative
// so the same build also works on GitHub Pages or a local preview.
export default defineConfig({
  base: "./",
  plugins: [react(), injectCsp(), forceSingleThreadAvif()],
  build: {
    target: "es2022",
    sourcemap: false,
  },
  worker: {
    format: "es",
  },
});
