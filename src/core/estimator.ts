import type {
  CompressionLevel,
  CompressionProfile,
  CompressionResult,
  EstimateMatrix,
} from "./types";
import { COMPRESSION_LEVELS } from "./types";
import { PROFILES } from "./profiles";
import type { WorkerBridge } from "./worker-bridge";

// Above this input size the estimate switches from an exact whole-file
// compression (isEstimate false) to a sampled extrapolation (isEstimate true).
// H4/PRD: the estimate is the REAL compression per level, never a theoretical
// formula, except for very large files where sampling keeps it responsive.
export const SAMPLE_THRESHOLD = 50 * 1024 * 1024;

export interface EstimateRunInput {
  file: File;
  level: CompressionLevel;
  profile: CompressionProfile;
  /** True when the file exceeds the threshold and the engine may sample. */
  allowSampling: boolean;
}

/** Runs one level's compression. Injected so the estimator is worker-agnostic. */
export type EstimateRunner = (input: EstimateRunInput) => Promise<CompressionResult>;

export interface EstimateOptions {
  run: EstimateRunner;
  /** Called once per level as soon as that level resolves (progressive UI). */
  onLevelDone?: (level: CompressionLevel, outcome: CompressionResult | "error") => void;
  /** Overridable so tests can force the sampling path on small fixtures. */
  sampleThreshold?: number;
}

export function createInitialMatrix(): EstimateMatrix {
  return { light: "pending", balanced: "pending", maximum: "pending" };
}

/**
 * Estimates the gain for all three levels, resolving each independently and
 * reporting it through onLevelDone the moment it lands. A level that fails
 * becomes "error" in the matrix instead of rejecting the whole run, so one bad
 * level never hides the other two.
 */
export async function estimateAll(file: File, options: EstimateOptions): Promise<EstimateMatrix> {
  const threshold = options.sampleThreshold ?? SAMPLE_THRESHOLD;
  const allowSampling = file.size > threshold;
  const matrix = createInitialMatrix();
  await Promise.all(
    COMPRESSION_LEVELS.map(async (level) => {
      try {
        const result = await options.run({
          file,
          level,
          profile: PROFILES[level],
          allowSampling,
        });
        matrix[level] = result;
        options.onLevelDone?.(level, result);
      } catch {
        matrix[level] = "error";
        options.onLevelDone?.(level, "error");
      }
    }),
  );
  return matrix;
}

/**
 * Production runner: dispatches each level to the shared compression worker.
 * Job ids stay unique per (file, level) so concurrent level jobs never collide.
 */
export function createWorkerRunner(bridge: WorkerBridge): EstimateRunner {
  let seq = 0;
  return ({ file, level, profile, allowSampling }) =>
    bridge.run({ jobId: `est-${level}-${(seq++).toString()}`, file, profile, allowSampling });
}
