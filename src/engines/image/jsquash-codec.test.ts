import { describe, expect, it } from "vitest";
import { createJsquashCodec } from "./jsquash-codec";
import type { PixelOps } from "./jsquash-codec";
import type { CodecLoaders } from "./codec-loaders";
import { CompressionError } from "../../core/types";
import type { EncodePlan, SourceDimensions } from "./raster-codec";

// The WASM codecs cannot run under happy-dom (gotcha D5 convertisseur), so the
// codec's DECISION logic -- codec selection per output mime, the lossless
// oxipng shortcut on untouched PNG bytes, the resize path, the native->WASM
// decode fallback and the quality scale conversion -- is tested through the
// injected seams, exactly like T1 tests the engine through RasterCodec. The
// real pixel path is proven by jsquash-jpeg.test.ts (real WASM under Node)
// and by the browser E2E suite.

function imageOf(width: number, height: number): ImageData {
  return {
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
    colorSpace: "srgb",
  };
}

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).buffer;
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]).buffer;
const UNKNOWN_BYTES = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]).buffer;

interface RecordedCalls {
  encodes: Array<{ codec: string; quality: number; width: number; height: number }>;
  decodes: string[];
  optimiseBytes: ArrayBuffer[];
  optimiseRaw: Array<{ width: number; height: number }>;
  resizes: Array<{ width: number; height: number }>;
}

function fakeSetup(options?: {
  nativeDecodeFails?: boolean;
  sourceDims?: SourceDimensions;
}): { loaders: CodecLoaders; pixels: PixelOps; calls: RecordedCalls } {
  const dims = options?.sourceDims ?? { width: 8, height: 6 };
  const calls: RecordedCalls = {
    encodes: [],
    decodes: [],
    optimiseBytes: [],
    optimiseRaw: [],
    resizes: [],
  };
  const encoded = new Uint8Array([1, 2, 3]).buffer;
  const lossy = (codec: string) => ({
    decode: () => {
      calls.decodes.push(codec);
      return Promise.resolve(imageOf(dims.width, dims.height));
    },
    encode: (image: ImageData, quality: number) => {
      calls.encodes.push({ codec, quality, width: image.width, height: image.height });
      return Promise.resolve(encoded);
    },
  });
  const loaders: CodecLoaders = {
    loadJpeg: () => Promise.resolve(lossy("jpeg")),
    loadPng: () => Promise.resolve(lossy("png")),
    loadWebp: () => Promise.resolve(lossy("webp")),
    loadAvif: () => Promise.resolve(lossy("avif")),
    loadOxipng: () =>
      Promise.resolve({
        optimiseBytes: (png: ArrayBuffer) => {
          calls.optimiseBytes.push(png);
          return Promise.resolve(new Uint8Array([9, 9]).buffer);
        },
        optimiseRaw: (image: ImageData) => {
          calls.optimiseRaw.push({ width: image.width, height: image.height });
          return Promise.resolve(new Uint8Array([8, 8]).buffer);
        },
      }),
  };
  const pixels: PixelOps = {
    decodeNative: () =>
      options?.nativeDecodeFails === true
        ? Promise.reject(new Error("native decoder unavailable"))
        : Promise.resolve(imageOf(dims.width, dims.height)),
    resize: (_image, width, height) => {
      calls.resizes.push({ width, height });
      return Promise.resolve(imageOf(width, height));
    },
  };
  return { loaders, pixels, calls };
}

function planOf(mimeType: string, quality?: number): (dims: SourceDimensions) => EncodePlan {
  return (dims) => {
    const base = { targetWidth: dims.width, targetHeight: dims.height, mimeType };
    return quality === undefined ? base : { ...base, quality };
  };
}

describe("jsquash codec selection", () => {
  it.each([
    ["image/jpeg", "jpeg"],
    ["image/webp", "webp"],
    ["image/avif", "avif"],
  ])("routes a %s plan to the %s encoder with the 1..100 quality", async (mime, codecName) => {
    const { loaders, pixels, calls } = fakeSetup();
    const codec = createJsquashCodec({ loaders, pixels });
    const blob = await codec.reencode(JPEG_BYTES, "image/jpeg", planOf(mime, 0.55));

    expect(blob.type).toBe(mime);
    expect(calls.encodes).toEqual([{ codec: codecName, quality: 55, width: 8, height: 6 }]);
    expect(calls.resizes).toEqual([]);
  });

  it("rejects an unknown output mime with an internal error", async () => {
    const { loaders, pixels } = fakeSetup();
    const codec = createJsquashCodec({ loaders, pixels });
    await expect(
      codec.reencode(JPEG_BYTES, "image/jpeg", planOf("image/tiff", 0.5)),
    ).rejects.toMatchObject({ code: "internal-error" });
  });
});

describe("jsquash codec lossless png path", () => {
  it("optimises the ORIGINAL bytes when the png needs no resize", async () => {
    const { loaders, pixels, calls } = fakeSetup();
    const codec = createJsquashCodec({ loaders, pixels });
    const blob = await codec.reencode(PNG_BYTES, "image/png", planOf("image/png"));

    expect(blob.type).toBe("image/png");
    expect(calls.optimiseBytes).toHaveLength(1);
    // The untouched source buffer, not a re-encode of decoded pixels.
    expect(calls.optimiseBytes[0]).toBe(PNG_BYTES);
    expect(calls.optimiseRaw).toEqual([]);
    expect(calls.encodes).toEqual([]);
  });

  it("re-encodes resized pixels through oxipng when a resize applies", async () => {
    const { loaders, pixels, calls } = fakeSetup({ sourceDims: { width: 100, height: 50 } });
    const codec = createJsquashCodec({ loaders, pixels });
    const blob = await codec.reencode(PNG_BYTES, "image/png", (dims) => ({
      targetWidth: Math.round(dims.width / 2),
      targetHeight: Math.round(dims.height / 2),
      mimeType: "image/png",
    }));

    expect(blob.type).toBe("image/png");
    expect(calls.resizes).toEqual([{ width: 50, height: 25 }]);
    expect(calls.optimiseRaw).toEqual([{ width: 50, height: 25 }]);
    expect(calls.optimiseBytes).toEqual([]);
  });
});

describe("jsquash codec resize", () => {
  it("resizes before a lossy encode when the plan shrinks the image", async () => {
    const { loaders, pixels, calls } = fakeSetup({ sourceDims: { width: 4000, height: 3000 } });
    const codec = createJsquashCodec({ loaders, pixels });
    await codec.reencode(JPEG_BYTES, "image/jpeg", (dims) => ({
      targetWidth: Math.round(dims.width / 2),
      targetHeight: Math.round(dims.height / 2),
      mimeType: "image/jpeg",
      quality: 0.75,
    }));

    expect(calls.resizes).toEqual([{ width: 2000, height: 1500 }]);
    expect(calls.encodes).toEqual([{ codec: "jpeg", quality: 75, width: 2000, height: 1500 }]);
  });
});

describe("jsquash codec decode fallback", () => {
  it("falls back to the WASM decoder matching the magic bytes when native decode fails", async () => {
    const { loaders, pixels, calls } = fakeSetup({ nativeDecodeFails: true });
    const codec = createJsquashCodec({ loaders, pixels });
    const blob = await codec.reencode(JPEG_BYTES, "image/jpeg", planOf("image/jpeg", 0.55));

    expect(blob.type).toBe("image/jpeg");
    expect(calls.decodes).toEqual(["jpeg"]);
    expect(calls.encodes).toHaveLength(1);
  });

  it("reports corrupted-file when native decode fails and no signature matches", async () => {
    const { loaders, pixels } = fakeSetup({ nativeDecodeFails: true });
    const codec = createJsquashCodec({ loaders, pixels });
    const failure = codec.reencode(UNKNOWN_BYTES, "image/jpeg", planOf("image/jpeg", 0.55));
    await expect(failure).rejects.toBeInstanceOf(CompressionError);
    await expect(failure).rejects.toMatchObject({ code: "corrupted-file" });
  });

  it("reports corrupted-file when both native and WASM decoders fail", async () => {
    const { loaders, pixels } = fakeSetup({ nativeDecodeFails: true });
    const failing: CodecLoaders = {
      ...loaders,
      loadJpeg: () =>
        Promise.resolve({
          decode: () => Promise.reject(new Error("bitstream error")),
          encode: () => Promise.resolve(new ArrayBuffer(1)),
        }),
    };
    const codec = createJsquashCodec({ loaders: failing, pixels });
    const failure = codec.reencode(JPEG_BYTES, "image/jpeg", planOf("image/jpeg", 0.55));
    await expect(failure).rejects.toMatchObject({
      code: "corrupted-file",
      message: expect.stringContaining("bitstream error") as string,
    });
  });
});
