import { createOfficeEngine } from "./office-engine";
import { offscreenCanvasCodec } from "../image/offscreen-codec";

// Production office engine: OOXML repackaging wired to the same RasterCodec as
// the image family, so media re-encoding automatically improves when T2 swaps
// the codec for the @jsquash-backed one. When T2's oxipng lands, pass its
// lossless optimizer as `losslessPng` here to also shrink transparent PNGs.
export const officeEngine = createOfficeEngine({ codec: offscreenCanvasCodec });
