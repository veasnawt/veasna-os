import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import type { Project } from "@veasnawt/vcut/src/project/types";

export type DurableJobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";
export type DurableJobPhase = "queued" | "preparing" | "rendering-text" | "encoding" | "finalizing";

export interface DurableExportJob {
  id: string;
  projectId: string;
  userId: string | null;
  jobType: string;
  status: DurableJobStatus;
  phase: DurableJobPhase;
  progress: number;
  message: string | null;
  fileName: string;
  outputPath: string | null;
  outputUrl: string | null;
  errorMessage: string | null;
  projectSnapshot: Project;
  includeOutro: boolean;
  workerId: string | null;
  heartbeatAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  cancellationRequested: boolean;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface RawDbJobRow {
  id: string;
  project_id: string;
  user_id: string | null;
  job_type: string;
  status: DurableJobStatus;
  phase: DurableJobPhase;
  progress: number;
  message: string | null;
  file_name: string;
  output_path: string | null;
  output_url: string | null;
  error_message: string | null;
  project_snapshot: Project;
  include_outro: boolean;
  worker_id: string | null;
  heartbeat_at: string | null;
  attempt_count: number;
  max_attempts: number;
  cancellation_requested: boolean;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

function mapRowToJob(row: RawDbJobRow): DurableExportJob {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    jobType: row.job_type,
    status: row.status,
    phase: row.phase,
    progress: row.progress,
    message: row.message,
    fileName: row.file_name,
    outputPath: row.output_path,
    outputUrl: row.output_url,
    errorMessage: row.error_message,
    projectSnapshot: row.project_snapshot,
    includeOutro: row.include_outro,
    workerId: row.worker_id,
    heartbeatAt: row.heartbeat_at,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    cancellationRequested: row.cancellation_requested,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

/** Enqueues a new durable export job. Returns the created job record. */
export async function createDurableExportJob(options: {
  projectId: string;
  userId: string | null;
  fileName: string;
  project: Project;
  includeOutro: boolean;
}): Promise<DurableExportJob> {
  const { data, error } = await getSupabaseAdminClient()
    .from("vcut_export_jobs")
    .insert({
      project_id: options.projectId,
      user_id: options.userId,
      file_name: options.fileName,
      project_snapshot: options.project,
      include_outro: options.includeOutro,
      status: "queued",
      phase: "queued",
      progress: 0.0,
      message: "Queued",
    })
    .select()
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to insert export job record");
  }

  return mapRowToJob(data as RawDbJobRow);
}

/** Looks up an export job by ID. */
export async function getDurableExportJob(jobId: string): Promise<DurableExportJob | null> {
  const { data, error } = await getSupabaseAdminClient()
    .from("vcut_export_jobs")
    .select()
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) return null;
  return mapRowToJob(data as RawDbJobRow);
}

/** Finds any currently queued or processing export job for a project. */
export async function findActiveExportJobForProject(projectId: string): Promise<DurableExportJob | null> {
  const { data, error } = await getSupabaseAdminClient()
    .from("vcut_export_jobs")
    .select()
    .eq("project_id", projectId)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapRowToJob(data as RawDbJobRow);
}

/** Requests cancellation for a durable export job. */
export async function requestCancelDurableExportJob(jobId: string): Promise<boolean> {
  // If the job is still queued, transition immediately to cancelled
  const { data: queuedData } = await getSupabaseAdminClient()
    .from("vcut_export_jobs")
    .update({ status: "cancelled", cancellation_requested: true, completed_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("id");

  if (queuedData && queuedData.length > 0) return true;

  // Otherwise flag cancellation_requested so worker aborts on next heartbeat/step
  const { data, error } = await getSupabaseAdminClient()
    .from("vcut_export_jobs")
    .update({ cancellation_requested: true })
    .eq("id", jobId)
    .eq("status", "processing")
    .select("id");

  return !error && !!data && data.length > 0;
}

/** Atomically claims the next queued or stalled job using PostgreSQL row locking (`FOR UPDATE SKIP LOCKED`). */
export async function claimNextExportJob(workerId: string, staleAfterSeconds = 90): Promise<DurableExportJob | null> {
  const { data, error } = await getSupabaseAdminClient().rpc("claim_vcut_export_job", {
    p_worker_id: workerId,
    p_stale_after_seconds: staleAfterSeconds,
  });

  if (error) {
    console.error("[vcut] queue: claim_vcut_export_job rpc error:", error);
    return null;
  }

  const rows = data as RawDbJobRow[] | null;
  if (!rows || rows.length === 0) return null;
  return mapRowToJob(rows[0]);
}

/** Reports progress and updates heartbeat. Returns true if user requested cancellation. */
export async function heartbeatExportJob(
  jobId: string,
  workerId: string,
  update?: { progress?: number; phase?: DurableJobPhase; message?: string }
): Promise<boolean> {
  const { data, error } = await getSupabaseAdminClient().rpc("heartbeat_vcut_export_job", {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_progress: typeof update?.progress === "number" ? update.progress : null,
    p_phase: update?.phase ?? null,
    p_message: update?.message ?? null,
  });

  if (error) {
    console.error("[vcut] queue: heartbeat_vcut_export_job rpc error:", error);
    return false;
  }

  return Boolean(data);
}

/** Marks a job as successfully completed. */
export async function markExportJobCompleted(
  jobId: string,
  workerId: string,
  result: { outputPath: string; outputUrl?: string }
): Promise<void> {
  const { error } = await getSupabaseAdminClient()
    .from("vcut_export_jobs")
    .update({
      status: "completed",
      phase: "finalizing",
      progress: 1.0,
      output_path: result.outputPath,
      output_url: result.outputUrl ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("worker_id", workerId);

  if (error) {
    console.error("[vcut] queue: failed to mark job completed:", error);
    throw error;
  }
}

/** Marks a job as failed. */
export async function markExportJobFailed(
  jobId: string,
  workerId: string,
  errorMessage: string
): Promise<void> {
  const { error } = await getSupabaseAdminClient()
    .from("vcut_export_jobs")
    .update({
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("worker_id", workerId);

  if (error) {
    console.error("[vcut] queue: failed to mark job failed:", error);
  }
}

/** Marks a job as cancelled after worker aborted processing. */
export async function markExportJobCancelled(jobId: string, workerId: string): Promise<void> {
  const { error } = await getSupabaseAdminClient()
    .from("vcut_export_jobs")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("worker_id", workerId);

  if (error) {
    console.error("[vcut] queue: failed to mark job cancelled:", error);
  }
}
