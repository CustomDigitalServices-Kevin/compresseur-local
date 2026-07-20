import { CompressionError, EngineNotRegisteredError } from "../core/types";
import type { CompressionErrorCode, WorkerInbound, WorkerOutbound } from "../core/types";
import { detectType, getEngineLoader } from "../core/registry";
import { registerBundledEngines } from "./engine-registration";

// Jobs are processed strictly one at a time: compression is CPU-bound, so
// interleaving in a single worker would only thrash memory. Cancellation is
// handled by the bridge terminating the whole worker (the only reliable way to
// stop synchronous WASM), then respawning it.
registerBundledEngines();

const scope = self as unknown as Omit<Worker, "postMessage"> & {
  postMessage: (message: WorkerOutbound, transfer?: Transferable[]) => void;
};

let queue: Promise<void> = Promise.resolve();

scope.addEventListener("message", (event: MessageEvent<WorkerInbound>) => {
  const message = event.data;
  queue = queue.then(() => runJob(message));
});

async function runJob(message: WorkerInbound): Promise<void> {
  const { jobId, data, fileName, fileType, profile, allowSampling } = message;
  try {
    const detected = detectType(fileName, data);
    if (detected === null) {
      throw new CompressionError("unsupported-family", `Unrecognized file type for ${fileName}`);
    }
    const loadEngine = getEngineLoader(detected.family);
    const engine = await loadEngine();
    const file = new File([data], fileName, { type: fileType });
    const result =
      allowSampling && engine.estimate !== undefined
        ? await engine.estimate(file, profile)
        : await engine.compress(file, profile);
    const outData = await result.blob.arrayBuffer();
    scope.postMessage(
      {
        kind: "result",
        jobId,
        result: {
          bytesBefore: result.bytesBefore,
          bytesAfter: result.bytesAfter,
          gainPercent: result.gainPercent,
          data: outData,
          mimeType: result.blob.type,
          isEstimate: result.isEstimate,
          sampled: result.sampled,
        },
      },
      [outData],
    );
  } catch (error) {
    const code: CompressionErrorCode =
      error instanceof EngineNotRegisteredError
        ? "engine-not-registered"
        : error instanceof CompressionError
          ? error.code
          : "internal-error";
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[compression.worker] ${fileName} failed (${code}): ${detail}`);
    scope.postMessage({ kind: "error", jobId, code, detail });
  }
}
