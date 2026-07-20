import { createImageEngine } from "./canvas-engine";
import { offscreenCanvasCodec } from "./offscreen-codec";
import { codecLoaders } from "./codec-loaders";
import { createFallbackCodec } from "./fallback-codec";
import { createJsquashCodec } from "./jsquash-codec";
import { offscreenPixelOps } from "./pixel-ops";

// Production image engine: jSquash WASM codecs (MozJPEG / WebP / single-thread
// AVIF / Oxipng) behind the RasterCodec seam, with the native canvas codec as
// a logged fallback when a WASM payload cannot load. Loaded lazily by the
// worker's engine registration, so none of this touches the initial bundle.
const jsquashCodec = createJsquashCodec({ loaders: codecLoaders, pixels: offscreenPixelOps });

export const imageEngine = createImageEngine({
  codec: createFallbackCodec(jsquashCodec, offscreenCanvasCodec, (message) => {
    console.warn(message);
  }),
});
