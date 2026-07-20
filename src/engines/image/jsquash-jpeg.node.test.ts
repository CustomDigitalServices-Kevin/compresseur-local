// @vitest-environment node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";

// Real-WASM proof for the jSquash image codecs. The browser codec loaders
// (codec-loaders.ts) rely on jSquash's default import.meta.url auto-init, which
// has no dev server under `vitest run`; jSquash's own Node.js example
// (examples/with-node) instead feeds the on-disk .wasm bytes to init() via the
// emscripten `wasmBinary` option, which is exactly what this test does. It
// runs under the `node` environment (not happy-dom) so the emscripten module
// sees a real Node global. If a future jSquash release stops initializing
// under Node, this test fails loudly and the real pixel guarantee falls back
// to the browser E2E suite -- documented, not silent.
//
// This exercises the genuine MozJPEG encoder + decoder end to end (quality
// scaling, RGBA round-trip), the same codec codec-loaders wires in the browser.
const require = createRequire(import.meta.url);

// Buffer.buffer is a shared pool slice (and typed ArrayBufferLike): copy the
// bytes into a standalone ArrayBuffer instead of handing the pool to the WASM
// module (memory: node Buffer slice pool gotcha).
function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

let encode: (data: ImageData, options?: { quality?: number }) => Promise<ArrayBuffer>;
let decode: (data: ArrayBuffer) => Promise<ImageData>;

beforeAll(async () => {
  const decodeModule = await import("@jsquash/jpeg/decode.js");
  const encodeModule = await import("@jsquash/jpeg/encode.js");
  const decWasm = toArrayBuffer(
    readFileSync(require.resolve("@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm")),
  );
  const encWasm = toArrayBuffer(
    readFileSync(require.resolve("@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm")),
  );
  await decodeModule.init({ wasmBinary: decWasm });
  await encodeModule.init({ wasmBinary: encWasm });
  encode = encodeModule.default;
  decode = decodeModule.default;
});

function solidImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 200;
    data[i * 4 + 1] = 80;
    data[i * 4 + 2] = 40;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height, colorSpace: "srgb" };
}

/**
 * A high-frequency noise field: a flat color compresses to the JPEG floor at
 * any quality, so the quality knob only visibly moves bytes on detailed
 * content. Deterministic LCG keeps the test reproducible.
 */
function noiseImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 0x1234_5678;
  for (let i = 0; i < width * height; i++) {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fff_ffff;
    data[i * 4] = seed & 0xff;
    data[i * 4 + 1] = (seed >> 8) & 0xff;
    data[i * 4 + 2] = (seed >> 16) & 0xff;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height, colorSpace: "srgb" };
}

describe("real @jsquash/jpeg codec (Node WASM)", () => {
  it("encodes RGBA pixels to a JPEG bitstream and decodes them back at matching dimensions", async () => {
    const source = solidImage(16, 12);
    const jpeg = await encode(source, { quality: 70 });
    expect(jpeg.byteLength).toBeGreaterThan(0);
    // Real JPEG start-of-image marker.
    expect(new Uint8Array(jpeg).subarray(0, 2)).toEqual(new Uint8Array([0xff, 0xd8]));

    const decoded = await decode(jpeg);
    expect(decoded.width).toBe(16);
    expect(decoded.height).toBe(12);
    expect(decoded.data.length).toBe(16 * 12 * 4);
    // A solid fill survives a quality-70 round-trip close to the source color.
    expect(decoded.data[0]).toBeGreaterThan(150);
    expect(decoded.data[3]).toBe(255);
  });

  it("produces a smaller bitstream at lower quality for the same source", async () => {
    const source = noiseImage(64, 64);
    const high = await encode(source, { quality: 90 });
    const low = await encode(source, { quality: 30 });
    expect(low.byteLength).toBeLessThan(high.byteLength);
  });
});
