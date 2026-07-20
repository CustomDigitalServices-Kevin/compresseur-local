import type { CompressionProfile, CompressionResult, WorkerInbound, WorkerOutbound } from "./types";
import { CompressionError } from "./types";

interface PendingJob {
  resolve: (result: CompressionResult) => void;
  reject: (error: CompressionError) => void;
}

export interface CompressRunInput {
  jobId: string;
  file: File;
  profile: CompressionProfile;
  /** When true the worker may sample+extrapolate large inputs (estimate path). */
  allowSampling: boolean;
}

/**
 * Main-thread facade over the compression worker. One persistent worker
 * processes jobs sequentially (compression is CPU-bound); `cancelAll`
 * terminates it -- the only reliable way to stop running WASM -- and rejects
 * every pending job with "cancelled".
 */
export class WorkerBridge {
  private worker: Worker | null = null;
  private readonly pending = new Map<string, PendingJob>();

  private ensureWorker(): Worker {
    if (this.worker !== null) return this.worker;
    const worker = new Worker(new URL("../workers/compression.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event: MessageEvent<WorkerOutbound>) => {
      this.handleMessage(event.data);
    });
    this.worker = worker;
    return worker;
  }

  private handleMessage(message: WorkerOutbound): void {
    const job = this.pending.get(message.jobId);
    if (job === undefined) return;
    this.pending.delete(message.jobId);
    if (message.kind === "result") {
      const { result } = message;
      job.resolve({
        bytesBefore: result.bytesBefore,
        bytesAfter: result.bytesAfter,
        gainPercent: result.gainPercent,
        blob: new Blob([result.data], { type: result.mimeType }),
        isEstimate: result.isEstimate,
        sampled: result.sampled,
      });
    } else {
      job.reject(new CompressionError(message.code, message.detail));
    }
  }

  async run(input: CompressRunInput): Promise<CompressionResult> {
    const worker = this.ensureWorker();
    const data = await input.file.arrayBuffer();
    return new Promise<CompressionResult>((resolve, reject) => {
      this.pending.set(input.jobId, { resolve, reject });
      const message: WorkerInbound = {
        kind: "compress",
        jobId: input.jobId,
        profile: input.profile,
        allowSampling: input.allowSampling,
        fileName: input.file.name,
        fileType: input.file.type,
        data,
      };
      // Transfer the ArrayBuffer so the payload moves without a copy.
      worker.postMessage(message, [data]);
    });
  }

  cancelAll(): void {
    if (this.worker !== null) {
      this.worker.terminate();
      this.worker = null;
    }
    for (const [jobId, job] of this.pending) {
      job.reject(new CompressionError("cancelled", `Cancelled job ${jobId}`));
    }
    this.pending.clear();
  }
}
