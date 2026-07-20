import type { CompressionEngine } from "./engine";
import type { CompressionFamily } from "./types";
import { EngineNotRegisteredError } from "./types";
import { detectType } from "./detect";
import type { DetectedType } from "./detect";

// Family -> lazy engine loader. Engines register themselves (see
// workers/engine-registration.ts) with a dynamic import so Vite code-splits one
// chunk (JS + WASM) per family; the map costs nothing at startup. A family with
// no loader throws EngineNotRegisteredError rather than falling back to a
// placeholder -- that is the real runtime behavior while an engine (T3/T4) is
// not merged yet.
export type EngineLoader = () => Promise<CompressionEngine>;

const loaders = new Map<CompressionFamily, EngineLoader>();

export function registerEngine(family: CompressionFamily, loader: EngineLoader): void {
  loaders.set(family, loader);
}

export function hasEngine(family: CompressionFamily): boolean {
  return loaders.has(family);
}

/** Returns the loader for a family, or throws EngineNotRegisteredError. */
export function getEngineLoader(family: CompressionFamily): EngineLoader {
  const loader = loaders.get(family);
  if (loader === undefined) {
    throw new EngineNotRegisteredError(family);
  }
  return loader;
}

/** Clears every registration. Test-only seam; never called by app code. */
export function resetEngines(): void {
  loaders.clear();
}

export { detectType };
export type { DetectedType };
