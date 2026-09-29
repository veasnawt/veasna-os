import type { ChildProcess } from "child_process";
import { type DurableExportJob, type DurableJobPhase } from "./exportJobs.ts";
import { type ExportJobStore, defaultExportJobStore } from "./exportQueue.ts";
import { executeExportRender } from "./exportRenderer.ts";
import { ensureProjectDirs, userMediaPaths, resolveWithin } from "./paths.ts";

export interface ExportWorkerOptions {
  workerId?: string;
  store?: ExportJobStore;
  concurrency?: number;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  harnessBaseUrl?: string;
  log?: (message: string, detail?: unknown) => void;
}

export class ExportWorker {
  readonly workerId: string;
  private readonly store: ExportJobStore;
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly harnessBaseUrl: string;
  private readonly log: (message: string, detail?: unknown) => void;

  private running = false;
  private activeJobsCount = 0;
  private activeProcesses = new Map<string, { proc?: ChildProcess; cancel?: () => void; abortRequested: boolean }>();

  constructor(options: ExportWorkerOptions = {}) {
    this.workerId = options.workerId ?? `worker-${crypto.randomUUID().slice(0, 8)}`;
    this.store = options.store ?? defaultExportJobStore;
    this.concurrency = Math.max(1, options.concurrency ?? (Number(process.env.VCUT_WORKER_CONCURRENCY) || 1));
    this.pollIntervalMs = Math.max(1000, options.pollIntervalMs ?? 2000);
    this.heartbeatIntervalMs = Math.max(2000, options.heartbeatIntervalMs ?? 10_000);
    this.harnessBaseUrl =
      options.harnessBaseUrl ??
      process.env.VCUT_WEB_URL ??
      `http://127.0.0.1:${process.env.PORT ?? (process.env.VCUT_HOSTED === "true" ? 3000 : 3002)}`;
    this.log = options.log ?? ((msg, detail) => console.log(`[vcut-worker ${this.workerId}] ${msg}`, detail ?? ""));
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.log(`Started with concurrency=${this.concurrency}, pollInterval=${this.pollIntervalMs}ms`);

    while (this.running) {
      if (this.activeJobsCount < this.concurrency) {
        try {
          const claimed = await this.store.claimJob(this.workerId);
          if (claimed) {
            this.activeJobsCount++;
            void this.processJob(claimed).finally(() => {
              this.activeJobsCount = Math.max(0, this.activeJobsCount - 1);
            });
            continue; // Immediately check if another slot is open
          }
        } catch (err) {
          this.log("Error claiming job from queue:", err);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  stop(): void {
    this.log("Stopping worker...");
    this.running = false;
    for (const [jobId, item] of this.activeProcesses.entries()) {
      this.log(`Cancelling active process for job ${jobId}`);
      item.abortRequested = true;
      item.cancel?.();
      item.proc?.kill("SIGKILL");
    }
  }

  private async processJob(job: DurableExportJob): Promise<void> {
    this.log(`Claimed job ${job.id} for project ${job.projectId} (attempt ${job.attemptCount}/${job.maxAttempts})`);

    const activeState = { abortRequested: false, proc: undefined as ChildProcess | undefined, cancel: undefined as (() => void) | undefined };
    this.activeProcesses.set(job.id, activeState);

    let heartbeatTimer: NodeJS.Timeout | null = null;
    let currentProgress = 0.0;
    let currentPhase: DurableJobPhase = "preparing";
    let currentMessage: string | null = "Preparing your render workspace... 🎬";

    try {
      // Start background heartbeat
      heartbeatTimer = setInterval(async () => {
        try {
          const cancelRequested = await this.store.heartbeat(job.id, this.workerId, {
            progress: currentProgress,
            phase: currentPhase,
            message: currentMessage ?? undefined,
          });

          if (cancelRequested && !activeState.abortRequested) {
            this.log(`Cancellation requested for job ${job.id}`);
            activeState.abortRequested = true;
            activeState.cancel?.();
            activeState.proc?.kill("SIGKILL");
          }
        } catch (hbErr) {
          this.log(`Heartbeat failed for job ${job.id}:`, hbErr);
        }
      }, this.heartbeatIntervalMs);
      heartbeatTimer.unref?.();

      const paths = ensureProjectDirs(job.projectId);
      const libraryMediaDir =
        job.userId && process.env.VCUT_HOSTED === "true" ? userMediaPaths(job.userId).mediaDir : null;
      const outputPath = resolveWithin(paths.exportsDir, job.fileName);

      const renderResult = await executeExportRender({
        project: job.projectSnapshot,
        paths,
        outputPath,
        harnessBaseUrl: this.harnessBaseUrl,
        includeOutro: job.includeOutro,
        libraryMediaDir,
        callbacks: {
          onPhase: (phase, message) => {
            currentPhase = phase;
            currentMessage = message ?? null;
            void this.store.heartbeat(job.id, this.workerId, { phase, message, progress: currentProgress });
          },
          onProgress: (fraction) => {
            currentProgress = fraction;
            // Immediate heartbeat on significant progress step if desired
          },
          isCancelled: () => activeState.abortRequested,
          onProcessSpawned: (proc, cancel) => {
            activeState.proc = proc;
            activeState.cancel = cancel;
          },
        },
      });

      if (activeState.abortRequested) {
        await this.store.cancel(job.id, this.workerId);
        this.log(`Job ${job.id} cancelled`);
      } else {
        await this.store.complete(job.id, this.workerId, { outputPath: renderResult.outputPath });
        this.log(`Job ${job.id} completed successfully -> ${renderResult.outputPath}`);
      }
    } catch (err) {
      if (activeState.abortRequested) {
        await this.store.cancel(job.id, this.workerId);
        this.log(`Job ${job.id} cancelled`);
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.log(`Job ${job.id} failed:`, errorMsg);
        await this.store.fail(job.id, this.workerId, errorMsg);
      }
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      this.activeProcesses.delete(job.id);
    }
  }
}
