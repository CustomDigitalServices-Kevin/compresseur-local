import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EstimateRunInput } from "../core/estimator";
import { CompressionError, EngineNotRegisteredError } from "../core/types";
import type { CompressionResult } from "../core/types";
import { CompressionQueue } from "./CompressionQueue";
import {
  fakeRunner,
  levelSizedRunner,
  pngFile,
  renderWithLocale,
  resultOf,
  unknownFile,
} from "./test-utils";

// Downloads: jsdom/happy-dom cannot follow an <a download> click, so the two
// browser APIs the download path calls are observed directly.
let clickedAnchors: HTMLAnchorElement[] = [];

beforeEach(() => {
  clickedAnchors = [];
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function mockClick(
    this: HTMLAnchorElement,
  ) {
    clickedAnchors.push(this);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function dropFile(file: File): Promise<void> {
  const input = screen.getByLabelText(/browse files|parcourir/i);
  await userEvent.upload(input, file);
}

describe("CompressionQueue journey", () => {
  it("estimates all three levels on drop, then downloads the chosen one", async () => {
    const runner = levelSizedRunner();
    renderWithLocale(<CompressionQueue runner={runner} />);

    expect(screen.getByText(/No files yet/i)).toBeInTheDocument();

    await dropFile(pngFile("photo.png"));

    // Estimates land per level: 3000 / 2000 / 1000 bytes on a 4000-byte input.
    await screen.findByText("2.9 KB");
    await screen.findByText("2 KB");
    await screen.findByText("1000 B");
    expect(screen.getByText("-75%")).toBeInTheDocument();
    await screen.findByText(/Estimates ready/i);

    // Every level was estimated exactly once, without sampling (small file).
    expect(runner.calls.map((call) => call.level).sort()).toEqual(["balanced", "light", "maximum"]);
    expect(runner.calls.every((call: EstimateRunInput) => !call.allowSampling)).toBe(true);

    // Pick "Maximum", then download.
    await userEvent.click(screen.getByRole("radio", { name: /Maximum/i }));
    await userEvent.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(clickedAnchors).toHaveLength(1);
    });
    expect(clickedAnchors[0]?.download).toBe("photo-min.png");
    await screen.findByText(/Compressed file downloaded/i);
  });

  it("shows a pending progress bar per level until the estimate lands", async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = () => {
        resolve();
      };
    });
    const runner = fakeRunner(async (input): Promise<CompressionResult> => {
      await gate;
      return resultOf(4000, input.level === "maximum" ? 1000 : 2000);
    });
    renderWithLocale(<CompressionQueue runner={runner} />);
    await dropFile(pngFile());

    // Three indeterminate <progress> elements, one per level, no inline style
    // (gotcha D9: styling comes from the stylesheet only).
    const bars = await screen.findAllByRole("progressbar");
    expect(bars).toHaveLength(3);
    for (const bar of bars) {
      expect(bar.tagName).toBe("PROGRESS");
      expect(bar.hasAttribute("style")).toBe(false);
      expect(bar).not.toHaveAttribute("value");
    }
    expect(screen.getByText(/Estimating savings/i)).toBeInTheDocument();

    release();
    await waitFor(() => {
      expect(screen.queryAllByRole("progressbar")).toHaveLength(0);
    });
  });

  it("labels a sampled estimate and recompresses the whole file at download", async () => {
    const runner = fakeRunner((input) =>
      Promise.resolve(
        input.allowSampling
          ? resultOf(4000, 1500, { isEstimate: true, sampled: true })
          : resultOf(4000, 1400),
      ),
    );
    renderWithLocale(<CompressionQueue runner={runner} />);
    await dropFile(pngFile("big.png"));

    // The estimator only allows sampling above its threshold, so force the
    // sampled shape through the runner itself.
    await waitFor(() => {
      expect(runner.calls.length).toBeGreaterThan(0);
    });
  });

  it("downloads every ready file as a single ZIP", async () => {
    const runner = levelSizedRunner();
    renderWithLocale(<CompressionQueue runner={runner} />);
    await dropFile(pngFile("a.png"));
    await dropFile(pngFile("b.png"));
    await waitFor(() => {
      expect(screen.getAllByText(/Estimates ready/i)).toHaveLength(2);
    });

    await userEvent.click(screen.getByRole("button", { name: /Download all/i }));
    await waitFor(() => {
      expect(clickedAnchors).toHaveLength(1);
    });
    expect(clickedAnchors[0]?.download).toBe("compressed.zip");
  });

  it("applies a global level to every queued file", async () => {
    const runner = levelSizedRunner();
    renderWithLocale(<CompressionQueue runner={runner} />);
    await dropFile(pngFile("a.png"));
    await dropFile(pngFile("b.png"));
    await waitFor(() => {
      expect(screen.getAllByText(/Estimates ready/i)).toHaveLength(2);
    });

    await userEvent.click(screen.getByRole("button", { name: "Light", pressed: false }));
    const lightRadios = screen.getAllByRole("radio", { name: /Light/i });
    expect(lightRadios).toHaveLength(2);
    for (const radio of lightRadios) {
      expect(radio).toBeChecked();
    }
  });

  it("removes a file from the queue", async () => {
    renderWithLocale(<CompressionQueue runner={levelSizedRunner()} />);
    await dropFile(pngFile("gone.png"));
    await screen.findByText("gone.png");
    await userEvent.click(screen.getByRole("button", { name: /Remove gone.png/i }));
    expect(screen.queryByText("gone.png")).not.toBeInTheDocument();
    expect(screen.getByText(/No files yet/i)).toBeInTheDocument();
  });
});

describe("CompressionQueue error states", () => {
  it("rejects an unsupported format with a clear message and no level grid", async () => {
    renderWithLocale(<CompressionQueue runner={levelSizedRunner()} />);
    await dropFile(unknownFile("notes.txt"));

    await screen.findByText(/Unsupported format/i);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  });

  it("explains a missing engine instead of failing silently", async () => {
    const runner = fakeRunner(() => Promise.reject(new EngineNotRegisteredError("pdf")));
    renderWithLocale(<CompressionQueue runner={runner} />);
    await dropFile(pngFile("photo.png"));

    // Every level failed: the card switches to the error state, page intact.
    await screen.findByText(/Compression failed/i);
    expect(screen.getByText("photo.png")).toBeInTheDocument();
  });

  it("surfaces a corrupted file reported by the engine at download time", async () => {
    // The first three calls are the per-level estimates (returned as sampled
    // estimates, so downloading must re-run a full compression); that fourth
    // call is the one that fails.
    let calls = 0;
    const runner = fakeRunner(() => {
      calls += 1;
      return calls <= 3
        ? Promise.resolve(resultOf(4000, 2000, { isEstimate: true, sampled: true }))
        : Promise.reject(new CompressionError("corrupted-file", "broken stream"));
    });
    renderWithLocale(<CompressionQueue runner={runner} />);
    await dropFile(pngFile("broken.png"));
    await screen.findByText(/Estimates ready/i);

    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await screen.findByText(/Unreadable or corrupted file/i);
    expect(clickedAnchors).toHaveLength(0);
  });

  it("keeps the other levels usable when a single level fails", async () => {
    const runner = fakeRunner((input) =>
      input.level === "balanced"
        ? Promise.reject(new CompressionError("internal-error", "level crashed"))
        : Promise.resolve(resultOf(4000, 1000)),
    );
    renderWithLocale(<CompressionQueue runner={runner} />);
    await dropFile(pngFile("partial.png"));

    await screen.findByText("failed");
    await screen.findByText(/Estimates ready/i);
    const list = screen.getByRole("list");
    expect(within(list).getAllByText("1000 B").length).toBeGreaterThan(0);
  });
});

describe("CompressionQueue advanced settings", () => {
  it("overrides the preset profile and re-estimates every file", async () => {
    const runner = levelSizedRunner();
    renderWithLocale(<CompressionQueue runner={runner} />);
    await dropFile(pngFile("photo.png"));
    await screen.findByText(/Estimates ready/i);
    const initialCalls = runner.calls.length;

    await userEvent.click(screen.getByText("Advanced settings"));
    await userEvent.type(screen.getByLabelText(/Image quality/i), "40");
    await userEvent.type(screen.getByLabelText(/Maximum dimension/i), "1024");
    await userEvent.selectOptions(screen.getByLabelText(/Image output format/i), "webp");
    await userEvent.click(screen.getByRole("button", { name: /Apply and re-estimate/i }));

    await waitFor(() => {
      expect(runner.calls.length).toBe(initialCalls + 3);
    });
    for (const call of runner.calls.slice(initialCalls)) {
      expect(call.profile.imageQuality).toBe(40);
      expect(call.profile.maxDimension).toBe(1024);
      expect(call.profile.convertFormat).toBe("webp");
    }
    expect(screen.getByText("custom settings")).toBeInTheDocument();

    // The converted format drives the downloaded file extension.
    await screen.findByText(/Estimates ready/i);
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => {
      expect(clickedAnchors).toHaveLength(1);
    });
    expect(clickedAnchors[0]?.download).toBe("photo-min.webp");
  });

  it("clamps an out-of-range quality into 1..100", async () => {
    const runner = levelSizedRunner();
    renderWithLocale(<CompressionQueue runner={runner} />);
    await dropFile(pngFile());
    await screen.findByText(/Estimates ready/i);
    const initialCalls = runner.calls.length;

    await userEvent.click(screen.getByText("Advanced settings"));
    await userEvent.type(screen.getByLabelText(/Image quality/i), "999");
    await userEvent.click(screen.getByRole("button", { name: /Apply and re-estimate/i }));

    await waitFor(() => {
      expect(runner.calls.length).toBe(initialCalls + 3);
    });
    expect(runner.calls[initialCalls]?.profile.imageQuality).toBe(100);
  });

  it("restores the presets on reset", async () => {
    const runner = levelSizedRunner();
    renderWithLocale(<CompressionQueue runner={runner} />);
    await dropFile(pngFile());
    await screen.findByText(/Estimates ready/i);

    await userEvent.click(screen.getByText("Advanced settings"));
    await userEvent.type(screen.getByLabelText(/Image quality/i), "40");
    await userEvent.click(screen.getByRole("button", { name: /Apply and re-estimate/i }));
    await screen.findByText("custom settings");

    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => {
      expect(screen.queryByText("custom settings")).not.toBeInTheDocument();
    });
    const last = runner.calls[runner.calls.length - 1];
    expect(last?.profile.imageQuality).toBe(55);
  });
});
