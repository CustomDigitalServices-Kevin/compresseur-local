import { describe, expect, it, vi } from "vitest";
import { createFallbackCodec } from "./fallback-codec";
import type { EncodePlan, RasterCodec, SourceDimensions } from "./raster-codec";
import { CompressionError } from "../../core/types";
import { CodecLoadError } from "./codec-loaders";

const DATA = new Uint8Array([1, 2, 3]).buffer;
const plan = (dims: SourceDimensions): EncodePlan => ({
  targetWidth: dims.width,
  targetHeight: dims.height,
  mimeType: "image/webp",
  quality: 0.7,
});

function okCodec(tag: string): RasterCodec {
  return { reencode: () => Promise.resolve(new Blob([tag], { type: "image/webp" })) };
}

function failingCodec(error: Error): RasterCodec {
  return { reencode: () => Promise.reject(error) };
}

async function textOf(blob: Blob): Promise<string> {
  return new TextDecoder().decode(await blob.arrayBuffer());
}

describe("fallback codec", () => {
  it("returns the primary result without warning when it succeeds", async () => {
    const warn = vi.fn();
    const codec = createFallbackCodec(okCodec("primary"), okCodec("fallback"), warn);
    const blob = await codec.reencode(DATA, "image/png", plan);
    expect(await textOf(blob)).toBe("primary");
    expect(warn).not.toHaveBeenCalled();
  });

  it("retries on the canvas fallback and warns loudly when the codec fails to load", async () => {
    const warn = vi.fn();
    const codec = createFallbackCodec(
      failingCodec(new CodecLoadError("avif", new Error("wasm 404"))),
      okCodec("fallback"),
      warn,
    );
    const blob = await codec.reencode(DATA, "image/avif", plan);
    expect(await textOf(blob)).toBe("fallback");
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("wasm 404");
  });

  it("does not fall back on a corrupted-file error (canvas cannot decode it either)", async () => {
    const warn = vi.fn();
    const fallback = { reencode: vi.fn() };
    const codec = createFallbackCodec(
      failingCodec(new CompressionError("corrupted-file", "bad bytes")),
      fallback,
      warn,
    );
    await expect(codec.reencode(DATA, "image/png", plan)).rejects.toMatchObject({
      code: "corrupted-file",
    });
    expect(fallback.reencode).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("surfaces both reasons when the fallback also fails", async () => {
    const warn = vi.fn();
    const codec = createFallbackCodec(
      failingCodec(new Error("encoder trap")),
      failingCodec(new Error("no OffscreenCanvas")),
      warn,
    );
    const failure = codec.reencode(DATA, "image/webp", plan);
    await expect(failure).rejects.toMatchObject({ code: "internal-error" });
    await expect(failure).rejects.toMatchObject({
      message: expect.stringContaining("encoder trap") as string,
    });
    await expect(failure).rejects.toMatchObject({
      message: expect.stringContaining("no OffscreenCanvas") as string,
    });
  });

  it("propagates a corrupted-file error raised by the fallback itself", async () => {
    const warn = vi.fn();
    const codec = createFallbackCodec(
      failingCodec(new Error("codec load failed")),
      failingCodec(new CompressionError("corrupted-file", "canvas decode failed")),
      warn,
    );
    await expect(codec.reencode(DATA, "image/webp", plan)).rejects.toMatchObject({
      code: "corrupted-file",
    });
    expect(warn).toHaveBeenCalledOnce();
  });
});
