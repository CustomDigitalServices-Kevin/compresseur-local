import { createImageEngine } from "./canvas-engine";
import { offscreenCanvasCodec } from "./offscreen-codec";

// Production image engine: the baseline Canvas codec wired to the T1 engine.
// T2 swaps offscreenCanvasCodec for the @jsquash-backed codec here.
export const imageEngine = createImageEngine({ codec: offscreenCanvasCodec });
