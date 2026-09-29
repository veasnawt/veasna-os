import type { Project } from "@veasnawt/vcut/src/project/types";
import {
  claimNextExportJob,
  createDurableExportJob,
  type DurableExportJob,
  type DurableJobPhase,
  type DurableJobStatus,
  findActiveExportJobForProject,
  getDurableExportJob,
  heartbeatExportJob,
  markExportJobCancelled,
  markExportJobCompleted,
  markExportJobFailed,
  requestCancelDurableExportJob,
} from "./exportJobs.ts";

export interface ExportJobStore {
  createJob(options: {
    projectId: string;
    userId: string | null;
    fileName: string;
    project: Project;
    includeOutro: boolean;
  }): Promise<DurableExportJob>;
  getJob(jobId: string): Promise<DurableExportJob | null>;
  findActiveJob(projectId: string): Promise<DurableExportJob | null>;
  requestCancel(jobId: string): Promise<boolean>;
  claimJob(workerId: string, staleAfterSeconds?: number): Promise<DurableExportJob | null>;
  heartbeat(
    jobId: string,
    workerId: string,
    update?: { progress?: number; phase?: DurableJobPhase; message?: string }
  ): Promise<boolean>;
  complete(jobId: string, workerId: string, result: { outputPath: string; outputUrl?: string }): Promise<void>;
  fail(jobId: string, workerId: string, errorMessage: string): Promise<void>;
  cancel(jobId: string, workerId: string): Promise<void>;
}

/** In-memory implementation of ExportJobStore for local dev, desktop mode, and unit tests. */
export class MemoryExportJobStore implements ExportJobStore {
  private jobs = new Map<string, DurableExportJob>();

  async createJob(options: {
    projectId: string;
    userId: string | null;
    fileName: string;
    project: Project;
    includeOutro: boolean;
  }): Promise<DurableExportJob> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const job: DurableExportJob = {
      id,
      projectId: options.projectId,
      userId: options.userId,
      jobType: "video_export",
      status: "queued",
      phase: "queued",
      progress: 0.0,
      message: "Queued",
      fileName: options.fileName,
      outputPath: null,
      outputUrl: null,
      errorMessage: null,
      projectSnapshot: options.project,
      includeOutro: options.includeOutro,
      workerId: null,
      heartbeatAt: null,
      attemptCount: 0,
      maxAttempts: 2,
      cancellationRequested: false,
      createdAt: now,
      startedAt: null,
      completedAt: null,
    };
    this.jobs.set(id, job);
    return job;
  }

  async getJob(jobId: string): Promise<DurableExportJob | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async findActiveJob(projectId: string): Promise<DurableExportJob | null> {
    for (const job of this.jobs.values()) {
      if (job.projectId === projectId && (job.status === "queued" || job.status === "processing")) {
        return job;
      }
    }
    return null;
  }

  async requestCancel(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    job.cancellationRequested = true;
    if (job.status === "queued") {
      job.status = "cancelled";
      job.completedAt = new Date().toISOString();
    }
    return true;
  }

  async claimJob(workerId: string, staleAfterSeconds = 90): Promise<DurableExportJob | null> {
    const nowMs = Date.now();
    for (const job of this.jobs.values()) {
      const isFreshQueued = job.status === "queued";
      const isStalledProcessing =
        job.status === "processing" &&
        job.heartbeatAt &&
        nowMs - new Date(job.heartbeatAt).getTime() > staleAfterSeconds * 1000 &&
        !job.cancellationRequested &&
        job.attemptCount < job.maxAttempts;

      if (isFreshQueued || isStalledProcessing) {
        job.status = "processing";
        job.phase = "preparing";
        job.workerId = workerId;
        job.attemptCount += 1;
        job.heartbeatAt = new Date().toISOString();
        job.startedAt ??= job.heartbeatAt;
        return job;
      }
    }
    return null;
  }

  async heartbeat(
    jobId: string,
    workerId: string,
    update?: { progress?: number; phase?: DurableJobPhase; message?: string }
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.workerId !== workerId || job.status !== "processing") return false;
    job.heartbeatAt = new Date().toISOString();
    if (typeof update?.progress === "number") job.progress = update.progress;
    if (update?.phase) job.phase = update.phase;
    if (update?.message !== undefined) job.message = update.message;
    return job.cancellationRequested;
  }

  async complete(
    jobId: string,
    workerId: string,
    result: { outputPath: string; outputUrl?: string }
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = "completed";
    job.phase = "finalizing";
    job.progress = 1.0;
    job.outputPath = result.outputPath;
    job.outputUrl = result.outputUrl ?? null;
    job.completedAt = new Date().toISOString();
  }

  async fail(jobId: string, workerId: string, errorMessage: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = "failed";
    job.errorMessage = errorMessage;
    job.completedAt = new Date().toISOString();
  }

  async cancel(jobId: string, workerId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = "cancelled";
    job.completedAt = new Date().toISOString();
  }
}

/** Supabase PostgreSQL implementation of ExportJobStore. */
export class SupabaseExportJobStore implements ExportJobStore {
  createJob = createDurableExportJob;
  getJob = getDurableExportJob;
  findActiveJob = findActiveExportJobForProject;
  requestCancel = requestCancelDurableExportJob;
  claimJob = claimNextExportJob;
  heartbeat = heartbeatExportJob;
  complete = markExportJobCompleted;
  fail = markExportJobFailed;
  cancel = markExportJobCancelled;
}

export function isDurableQueueActive(): boolean {
  return Boolean(
    process.env.VCUT_HOSTED === "true" &&
      process.env.VCUT_DURABLE_QUEUE === "true" &&
      process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/** Global default job store instance, resolved based on environment configuration. */
export const defaultExportJobStore: ExportJobStore = isDurableQueueActive()
  ? new SupabaseExportJobStore()
  : new MemoryExportJobStore();
