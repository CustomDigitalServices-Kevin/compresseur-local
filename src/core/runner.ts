import type { EstimateRunInput } from "./estimator";
import type { CompressionResult } from "./types";
import { WorkerBridge } from "./worker-bridge";

/**
 * The single seam through which the UI reaches the compression worker, for
 * both paths: the progressive per-level estimate (plugged straight into
 * estimateAll's `options.run`) and the full compression performed at download
 * time. Tests inject a fake implementation instead of spawning a real Worker,
 * which happy-dom does not provide -- this interface IS that supported
 * injection point, not an ad-hoc mock.
 */
export interface CompressionRunner {
  run(input: EstimateRunInput): Promise<CompressionResult>;
  /** Terminates in-flight work (used when the queue is cleared). */
  cancelAll(): void;
}

/** Production runner: one persistent worker shared by every job. */
export function createWorkerCompressionRunner(): CompressionRunner {
  const bridge = new WorkerBridge();
  let seq = 0;
  return {
    run: ({ file, level, profile, allowSampling }) => {
      seq += 1;
      return bridge.run({
        jobId: `${level}-${String(seq)}`,
        file,
        profile,
        allowSampling,
      });
    },
    cancelAll: () => {
      bridge.cancelAll();
    },
  };
}
