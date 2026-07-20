# Compresseur local

Compress images, PDF and Office files (DOCX, XLSX, PPTX) entirely in your
browser. No upload, no server, no account: files never leave your device.

Pick a compression level (light / balanced / maximum) and see the estimated
size gain **before** you download, computed by running the real compression in
a Web Worker.

## Status

Scaffold + core (task T1). Family engines are added incrementally:

- **image** — a real baseline engine ships in T1 (native Canvas re-encode);
  T2 replaces it with `@jsquash/*` codecs (MozJPEG / OxiPNG / WebP / AVIF).
- **pdf** — T3 (`pdfjs` + `pdf-lib`, optional `@jspawn/qpdf-wasm`).
- **office** — T4 (unzip, recompress embedded media, re-zip with `fflate`).

## Scripts

| Script                   | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `npm run dev`            | Vite dev server                                |
| `npm run build`          | Type-check then production build               |
| `npm test`               | Vitest unit/integration suite                  |
| `npm run lint`           | ESLint (strict type-checked)                   |
| `npm run typecheck`      | `tsc --noEmit`                                 |
| `npm run format`         | Prettier check                                 |
| `npm run check:licenses` | Fail on any non-allowlisted dependency license |

## Licensing

The product is MIT. AGPL and bundled LGPL are forbidden; `check:licenses`
enforces an allowlist in CI, and the in-app "Third-party licenses" page is
locked against `package.json` by a test.

## Privacy

100% local. A strict Content-Security-Policy (`connect-src 'self'`) makes the
browser itself block any network request during processing.
