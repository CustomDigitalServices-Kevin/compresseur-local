import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import type { EstimateRunInput } from "../core/estimator";
import type { CompressionRunner } from "../core/runner";
import type { CompressionResult } from "../core/types";
import { LocaleProvider } from "../i18n/LocaleProvider";

export function renderWithLocale(ui: ReactElement): RenderResult {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

/** Minimal valid PNG header, so detectType() classifies the fixture as an image. */
export function pngFile(name = "photo.png", size = 4000): File {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return new File([bytes], name, { type: "image/png" });
}

/** A file whose bytes match no supported signature. */
export function unknownFile(name = "notes.txt"): File {
  return new File([new TextEncoder().encode("plain text, no magic bytes")], name, {
    type: "text/plain",
  });
}

export function resultOf(
  bytesBefore: number,
  bytesAfter: number,
  options: { isEstimate?: boolean; sampled?: boolean } = {},
): CompressionResult {
  return {
    bytesBefore,
    bytesAfter,
    gainPercent: ((bytesBefore - bytesAfter) / bytesBefore) * 100,
    blob: new Blob([new Uint8Array(bytesAfter)], { type: "image/png" }),
    isEstimate: options.isEstimate ?? false,
    sampled: options.sampled ?? false,
  };
}

export interface FakeRunner extends CompressionRunner {
  readonly calls: EstimateRunInput[];
  cancelled: () => number;
}

/**
 * Deterministic stand-in for the Web Worker runner (happy-dom has no Worker).
 * It implements the documented CompressionRunner seam consumed by
 * CompressionQueue, so nothing outside that public contract is faked.
 */
export function fakeRunner(
  respond: (input: EstimateRunInput) => Promise<CompressionResult>,
): FakeRunner {
  const calls: EstimateRunInput[] = [];
  let cancelCount = 0;
  return {
    calls,
    cancelled: () => cancelCount,
    run: (input) => {
      calls.push(input);
      return respond(input);
    },
    cancelAll: () => {
      cancelCount += 1;
    },
  };
}

/** Runner whose output size shrinks with the level, all estimates exact. */
export function levelSizedRunner(bytesBefore = 4000): FakeRunner {
  const byLevel = { light: 3000, balanced: 2000, maximum: 1000 } as const;
  return fakeRunner((input) => Promise.resolve(resultOf(bytesBefore, byLevel[input.level])));
}
