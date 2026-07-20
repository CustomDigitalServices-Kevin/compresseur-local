# Compresseur local

Compress images, PDF and Office files **100% in your browser**. Your files never leave your device. No upload, no server, no account. GDPR-friendly by design.

Compressez images, PDF et fichiers Office **100% dans votre navigateur**. Vos fichiers ne quittent jamais votre appareil. Aucun envoi, aucun serveur, aucun compte.

## Why / Pourquoi

Online compressors upload your documents to third-party servers, even when they promise to delete them afterwards. For anything sensitive (legal, accounting, health, HR), the file has still left your device, crossed a network and been stored by someone else. This tool does every compression locally, with WebAssembly and browser APIs.

It also answers the question those tools never answer up front: **how much will I actually save?** Dropping a file runs the real compression for all three levels in a Web Worker and shows the resulting size and gain for each, _before_ you download anything. No theoretical formula. Only files above 50 MB fall back to a sampled estimate, and those are labeled as estimates.

## What it compresses

| Family | Input formats        | How                                                                                                                   |
| ------ | -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Images | PNG, JPG, WebP, AVIF | Re-encode at the chosen quality (MozJPEG, WebP, AVIF, OxiPNG) with an optional resize                                 |
| PDF    | PDF                  | Re-encode embedded JPEG images, then a qpdf structural pass (object streams, stream compression, flate recompression) |
| Office | DOCX, XLSX, PPTX     | Unzip, recompress the embedded media, re-zip at maximum deflate. Content XML is left byte-identical                   |

Optional advanced settings override any preset: image quality (1-100), maximum dimension, and image output format (WebP / AVIF / JPEG).

## Compression levels

| Level    | Image quality | Max dimension | Notes                                            |
| -------- | ------------- | ------------- | ------------------------------------------------ |
| Light    | 85            | none          | Full resolution. PNG stays **lossless** (OxiPNG) |
| Balanced | 75            | 2560 px       | PNG is re-encoded to WebP                        |
| Maximum  | 55            | 1920 px       | PNG is re-encoded to WebP                        |

Downloads are named after the format actually produced: a PNG re-encoded to WebP is saved as `.webp`, never as a `.png` containing WebP bytes.

## Measured results

From the end-to-end suite, on generated fixtures whose pixels carry real sensor-like noise (a flat gradient would compress unrealistically well):

| Case                                     | Before   | After   | Gain  |
| ---------------------------------------- | -------- | ------- | ----- |
| JPEG photo 2400x1600, maximum            | 2.00 MB  | 275 KB  | 86.6% |
| PNG photo, light (lossless)              | 10.75 MB | 5.49 MB | 49.0% |
| PNG photo, maximum (to WebP)             | 10.75 MB | 426 KB  | 96.1% |
| Scanned PDF, 2 pages at 150 DPI, maximum | 2.29 MB  | 482 KB  | 79.5% |
| DOCX with an embedded photo, maximum     | 2.00 MB  | 440 KB  | 78.5% |

The DOCX fixture is essentially one large photo, so its gain tracks the photo's. Documents that are mostly text will gain far less, because there is little left to compress.

## PDF: v1 scope limit

Only **DCTDecode** (baseline JPEG) images embedded in a PDF are re-encoded. Two cases are deliberately left untouched:

- **FlateDecode raster images** (PNG-like scans) would require decoding raw pixel data with full colorspace and predictor handling. They still benefit from the structural pass, but not from image re-encoding, so the gain on such a PDF is much smaller.
- **Images carrying transparency** (SMask / Mask) or unusual encodings are skipped rather than risking a corrupted document.

Encrypted (password-protected) PDFs are rejected with a clear message instead of failing silently.

## Privacy

- **No network at processing time.** A strict Content-Security-Policy (`default-src 'none'`, `connect-src 'self'`) makes the browser itself block any outbound request. The end-to-end suite additionally records every request the page makes and fails if a single one leaves the app origin.
- **Offline.** The app is a PWA: the shell is precached, and each codec is cached the first time it is used, so it keeps working with the network cut.
- **No analytics, no cookies, no account.**

## Development

| Script                   | Purpose                                             |
| ------------------------ | --------------------------------------------------- |
| `npm run dev`            | Vite dev server                                     |
| `npm run build`          | Type-check then production build                    |
| `npm test`               | Vitest unit and integration suite                   |
| `npm run test:e2e`       | Playwright end-to-end suite on the production build |
| `npm run lint`           | ESLint (strict, type-checked)                       |
| `npm run typecheck`      | `tsc --noEmit`                                      |
| `npm run format`         | Prettier check                                      |
| `npm run check:licenses` | Fail on any non-allowlisted dependency license      |

End-to-end fixtures are generated on the fly, never committed as binaries.

## Licensing

This project is MIT licensed (see `LICENSE`).

AGPL and bundled LGPL dependencies are forbidden: `npm run check:licenses` enforces an allowlist across the whole dependency tree, and the in-app "Third-party licenses" page is locked against `package.json` by a test. Every bundled library is MIT, Apache-2.0 or BSD.

Notably, PDF compression avoids Ghostscript and MuPDF (both AGPL), which is what most "strong" online PDF compressors are built on. It uses qpdf (Apache-2.0), pdf-lib (MIT) and pdf.js (Apache-2.0) instead.
