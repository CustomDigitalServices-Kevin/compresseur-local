// Lazily-loaded jSquash WASM codecs, one cached loader per codec, wired with
// dynamic import() so Vite code-splits a chunk per format and a session only
// pays for the formats it actually touches. All five packages are Apache-2.0
// (RAG Compresseur Local/compression-in-browser-libs, 2026-07-20).
//
// Threading policy (gotcha D8 convertisseur, PRD "AVIF single-thread force"):
// no SharedArrayBuffer is guaranteed on the static deployment (no COOP/COEP
// headers), so nothing may auto-select a multi-threaded WASM build.
//
//   - @jsquash/avif: its encode init() auto-picks avif_enc_mt.wasm whenever
//     wasm-feature-detect's threads() probe passes. We pre-compile the
//     single-thread avif_enc.wasm ourselves and hand it to init() before any
//     encode() call -- the exact pattern the convertisseur validated in its
//     avif.ts (and T7 must mirror its PWA globIgnores for avif_enc_mt*).
//     AVIF decode has no MT variant and keeps the default auto-init.
//   - @jsquash/oxipng: its public optimise() entry auto-picks the
//     codec/pkg-parallel build (wasm-bindgen-rayon thread pool) when running
//     inside a worker with hardwareConcurrency > 1. We bypass that entry
//     entirely and deep-import the single-thread codec/pkg build, so the
//     parallel chunk never even enters the bundle graph.
//   - jpeg / png / webp ship no multi-threaded build; their default auto-init
//     (import.meta.url-relative wasm, rewritten by Vite at build time) is safe.
import avifEncWasmUrl from "@jsquash/avif/codec/enc/avif_enc.wasm?url";
import oxipngWasmUrl from "@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm?url";

/**
 * Raised when a codec's JS or WASM payload cannot be loaded or initialized.
 * The fallback layer (fallback-codec.ts) reacts by retrying with the native
 * canvas codec, so a missing or broken WASM asset degrades to the baseline
 * pipeline instead of failing the job outright.
 */
export class CodecLoadError extends Error {
  constructor(codec: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to load the ${codec} codec: ${detail}`);
    this.name = "CodecLoadError";
  }
}

export interface ImageDecoder {
  decode(data: ArrayBuffer): Promise<ImageData>;
}

export interface LossyImageCodec extends ImageDecoder {
  /** `quality` is the UI's 1..100 scale, passed straight to the codec. */
  encode(image: ImageData, quality: number): Promise<ArrayBuffer>;
}

export interface OxipngCodec {
  /** Losslessly re-compresses an existing PNG file, pixels untouched. */
  optimiseBytes(png: ArrayBuffer): Promise<ArrayBuffer>;
  /** Encodes raw RGBA pixels into an optimized (lossless) PNG. */
  optimiseRaw(image: ImageData): Promise<ArrayBuffer>;
}

export interface CodecLoaders {
  loadJpeg(): Promise<LossyImageCodec>;
  loadPng(): Promise<ImageDecoder>;
  loadWebp(): Promise<LossyImageCodec>;
  loadAvif(): Promise<LossyImageCodec>;
  loadOxipng(): Promise<OxipngCodec>;
}

// A failed load is cached too: the bundle's assets cannot change within a
// session, so retrying could only fail the same way again -- every later job
// then goes straight to the canvas fallback instead of re-fetching a broken
// asset on each file.
function cached<T>(codec: string, factory: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => {
    promise ??= factory().catch((cause: unknown) => {
      throw new CodecLoadError(codec, cause);
    });
    return promise;
  };
}

// Squoosh/jSquash default effort level; upstream discourages values above 4
// (diminishing returns for a steep CPU cost).
const OXIPNG_LEVEL = 2;

/** Copies a view into an exactly-sized standalone ArrayBuffer. */
function copyToArrayBuffer(view: Uint8Array): ArrayBuffer {
  return new Uint8Array(view).buffer;
}

export const codecLoaders: CodecLoaders = {
  loadJpeg: cached("jpeg", async () => {
    const [{ default: decode }, { default: encode }] = await Promise.all([
      import("@jsquash/jpeg/decode.js"),
      import("@jsquash/jpeg/encode.js"),
    ]);
    return {
      // preserveOrientation rotates the pixels per the EXIF orientation tag
      // (jSquash jpeg README), matching createImageBitmap's "from-image", so
      // both decode paths hand upright pixels to the encoders.
      decode: (data) => decode(data, { preserveOrientation: true }),
      encode: (image, quality) => encode(image, { quality }),
    };
  }),
  loadPng: cached("png", async () => {
    const { default: decode } = await import("@jsquash/png/decode.js");
    // The no-options overload is the 8-bit path and resolves a plain ImageData.
    return { decode: (data) => decode(data) };
  }),
  loadWebp: cached("webp", async () => {
    const [{ default: decode }, { default: encode }] = await Promise.all([
      import("@jsquash/webp/decode.js"),
      import("@jsquash/webp/encode.js"),
    ]);
    return {
      decode: (data) => decode(data),
      encode: (image, quality) => encode(image, { quality }),
    };
  }),
  loadAvif: cached("avif", async () => {
    const [{ default: decode }, encodeModule] = await Promise.all([
      import("@jsquash/avif/decode.js"),
      import("@jsquash/avif/encode.js"),
    ]);
    // Force the single-thread encoder build (threading policy above): compile
    // avif_enc.wasm ourselves and initialize the encoder with it before any
    // encode() call can trigger the auto-detecting lazy init.
    const wasmModule = await WebAssembly.compileStreaming(fetch(avifEncWasmUrl));
    await encodeModule.init(wasmModule);
    return {
      decode: async (data) => {
        // Without a bitDepth option the library takes its 8-bit path and
        // resolves ImageData | null (null on undecodable input).
        const image = await decode(data);
        if (image === null) {
          throw new Error("AVIF decode returned no image data");
        }
        return image;
      },
      encode: (image, quality) => encodeModule.default(image, { quality }),
    };
  }),
  loadOxipng: cached("oxipng", async () => {
    // Deliberate deep import of the single-thread build (threading policy
    // above); the package publishes no "exports" map, so the path is public.
    const codec = await import("@jsquash/oxipng/codec/pkg/squoosh_oxipng.js");
    const { default: init, optimise, optimise_raw: optimiseRaw } = codec;
    await init(oxipngWasmUrl);
    return {
      optimiseBytes: (png) =>
        Promise.resolve(
          copyToArrayBuffer(optimise(new Uint8Array(png), OXIPNG_LEVEL, false, false)),
        ),
      optimiseRaw: (image) =>
        Promise.resolve(
          copyToArrayBuffer(
            optimiseRaw(image.data, image.width, image.height, OXIPNG_LEVEL, false, false),
          ),
        ),
    };
  }),
};
