import fs from "fs";
import Replicate from "replicate";
import { AI_EDIT_PRESERVE_KEYS, aiEditVideoCredits, AI_EDIT_VIDEO_MAX_SECONDS, AI_EDIT_VIDEO_MIN_SECONDS, buildAiEditInstruction, clampCreativity, type AiEditPreserve } from "@veasnawt/vcut/src/project/aiEdit";
import { findAsset, findClip } from "@veasnawt/vcut/src/project/createProject";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import type { Asset } from "@veasnawt/vcut/src/project/types";
import { runEditChain, uploadForModel, VIDEO_EDIT_MODELS } from "../../_lib/aiEditModels";
import { resolveAssetInputPath } from "../../_lib/assetInput";
import { VCUT_HOSTED } from "../../_lib/auth";
import { refundCredits } from "../../_lib/credits";
import { getReplicateTokenForGeneration } from "../../_lib/externalMediaEnv";
import { extractAiFramePng, extractCutoutInput } from "../../_lib/ffmpeg";
import { importMediaBytes } from "../../_lib/importMedia";
import { registerHold, releaseHold } from "../../_lib/jobHolds";
import { corsPreflight, hostedCreditGatedRouteCors, hostedSessionRouteCors } from "../../_lib/localOnly";
import { ApiError, ensureProjectDirs, ensureUserMediaDirs, resolveWithin, uniqueFileName } from "../../_lib/paths";
import { getProfile } from "../../_lib/profiles";
import { checkStorageQuota, insertUserMedia } from "../../_lib/userMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Stage = "predicting" | "downloading" | "importing";
type JobStatus = "running" | "done" | "failed" | "cancelled";

interface EditJob {
  id: string;
  status: JobStatus;
  stage: Stage;
  progress: number;
  asset?: Asset;
  bytesBase64?: string;
  error?: string;
  ownerId?: string;
  spentAmount: number;
  holdId?: string | null;
  abortController: AbortController;
  changed: Promise<void>;
  notify: () => void;
}

/** Same module-lifetime job map `ai-video/route.ts` keeps: an edit takes minutes, so it is a job the client watches. */
const jobs = new Map<string, EditJob>();

function makeNotifier(job: Partial<EditJob>): { changed: Promise<void>; notify: () => void } {
  let resolve!: () => void;
  const changed = new Promise<void>((r) => (resolve = r));
  return {
    changed,
    notify: () => {
      resolve();
      const next = makeNotifier(job);
      (job as EditJob).changed = next.changed;
      (job as EditJob).notify = next.notify;
    },
  };
}

const STAGE_RANGES: Record<Stage, [number, number]> = { predicting: [0.05, 0.85], downloading: [0.85, 0.95], importing: [0.95, 1] };

function setProgress(job: EditJob, stage: Stage, fraction: number) {
  const [start, end] = STAGE_RANGES[stage];
  job.stage = stage;
  job.progress = start + (end - start) * Math.min(1, Math.max(0, fraction));
  job.notify();
}

function nearestAspect(width: number | undefined, height: number | undefined): "16:9" | "9:16" | "1:1" {
  if (!width || !height) return "9:16";
  const ratio = width / height;
  return ratio > 1.3 ? "16:9" : ratio < 0.77 ? "9:16" : "1:1";
}

interface RunInput {
  bpProjectId: string;
  clipId: string;
  instruction: string;
  prompt: string;
  ownerId: string | undefined;
  deliverBytes: boolean;
}

async function runEditJob(job: EditJob, input: RunInput) {
  const paths = ensureProjectDirs(input.bpProjectId);
  const userMedia = VCUT_HOSTED && input.ownerId ? ensureUserMediaDirs(input.ownerId) : null;
  const scratch: string[] = [];
  try {
    const token = getReplicateTokenForGeneration();
    if (!token) throw new ApiError(503, "AI Edit is not configured on this server", "replicate-not-configured");

    const project = deserializeProject(fs.readFileSync(paths.projectFile, "utf-8"));
    const found = findClip(project, input.clipId);
    const asset = found ? findAsset(project, found.clip.assetId) : undefined;
    if (!found || !asset || asset.kind !== "video") throw new ApiError(404, "Clip not found", "clip-missing");
    const seconds = found.clip.sourceOut - found.clip.sourceIn;
    const sourcePath = resolveAssetInputPath(paths, userMedia?.mediaDir ?? null, asset);
    if (!fs.existsSync(sourcePath)) throw new ApiError(404, "Source file not found", "source-missing");

    job.progress = 0.02;
    job.notify();
    const clipPath = resolveWithin(paths.scratchDir, uniqueFileName("edit-input.mp4"));
    const framePath = resolveWithin(paths.scratchDir, uniqueFileName("edit-first-frame.png"));
    scratch.push(clipPath, framePath);
    await extractCutoutInput(sourcePath, clipPath, { startSeconds: found.clip.sourceIn, durationSeconds: seconds, audio: Boolean(asset.hasAudio) });
    await extractAiFramePng(sourcePath, framePath, { maxEdge: 1280, multipleOf: 2, atSeconds: found.clip.sourceIn, alpha: false });

    const replicate = new Replicate({ auth: token });
    const [video, firstFrame] = await Promise.all([
      uploadForModel(replicate, fs.readFileSync(clipPath), "video/mp4"),
      uploadForModel(replicate, fs.readFileSync(framePath), "image/png"),
    ]);

    setProgress(job, "predicting", 0.05);
    const result = await runEditChain(
      replicate,
      VIDEO_EDIT_MODELS,
      { prompt: input.instruction, video, firstFrame, seconds, aspectRatio: nearestAspect(asset.width, asset.height) },
      {
        signal: job.abortController.signal,
        noOutputMessage: "AI Edit returned no video",
        noOutputCode: "ai-edit-no-output",
        onProgress: (_i, status) => setProgress(job, "predicting", status === "succeeded" ? 1 : status === "processing" ? 0.6 : 0.2),
      }
    );

    setProgress(job, "importing", 0);
    const baseName = asset.name.replace(/\.[^.]+$/, "");
    const suggestedName = `${baseName}-ai-edit.mp4`;
    let built: Asset;
    if (userMedia && input.ownerId) {
      const profile = await getProfile(input.ownerId);
      await checkStorageQuota(input.ownerId, profile?.plan ?? "free", result.bytes.byteLength);
      built = await importMediaBytes(userMedia, result.bytes, suggestedName);
      if (built.kind !== "video") throw new ApiError(500, "Unexpected asset kind from AI Edit", "unexpected-asset-kind");
      built.name = `${baseName} (AI: ${input.prompt.slice(0, 20)})`;
      await insertUserMedia(input.ownerId, {
        id: built.id,
        kind: "video",
        name: built.name,
        relPath: built.relPath,
        thumbnailRelPath: built.thumbnailRelPath ?? null,
        filmstripRelPath: built.filmstripRelPath ?? null,
        waveformRelPath: built.waveformRelPath ?? null,
        duration: built.duration,
        width: built.width ?? null,
        height: built.height ?? null,
        fps: built.fps ?? null,
        hasAudio: built.hasAudio,
        sizeBytes: built.sizeBytes,
        aiGeneration: { prompt: input.prompt, aspectRatio: "custom", model: result.modelId },
        hidden: false,
      });
      built.libraryMediaId = built.id;
    } else {
      built = await importMediaBytes(paths, result.bytes, suggestedName);
      built.name = `${baseName} (AI: ${input.prompt.slice(0, 20)})`;
    }
    setProgress(job, "importing", 1);

    job.asset = built;
    if (input.deliverBytes) job.bytesBase64 = result.bytes.toString("base64");
    job.status = "done";
    job.progress = 1;
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    job.status = isAbort ? "cancelled" : "failed";
    if (job.status === "failed") {
      job.error = err instanceof ApiError ? err.message : "AI Edit is temporarily unavailable — please try again in a moment.";
      if (!(err instanceof ApiError)) console.error("[vcut] ai-edit video: job failed:", err);
      if (input.ownerId) void refundCredits(input.ownerId, job.spentAmount);
    }
  } finally {
    for (const f of scratch) fs.rm(f, { force: true }, () => {});
    void releaseHold(job.holdId);
    job.notify();
    setTimeout(() => jobs.delete(job.id), 60_000).unref?.();
  }
}

/** `POST /api/vcut/ai-edit/video?projectId=...` `{ clipId, prompt, creativity, preserve, deliverBytes }` — starts the job.
 *  Edits the clip's own source window as a video (Kling first, then the fallbacks in `_lib/aiEditModels.ts`) and answers
 *  with `{ jobId }`; progress and the finished asset arrive on this route's `GET` event stream. */
export const POST = hostedCreditGatedRouteCors("ai-edit-video", aiEditVideoCredits(AI_EDIT_VIDEO_MIN_SECONDS), async (req, user, spend) => {
  const bpProjectId = new URL(req.url).searchParams.get("projectId");
  if (!bpProjectId) throw new ApiError(400, "Missing projectId", "missing-project-id");
  const body = (await req.json().catch(() => ({}))) as { clipId?: string; prompt?: string; creativity?: number; preserve?: string[]; deliverBytes?: boolean };
  const prompt = body.prompt?.trim();
  if (!prompt) throw new ApiError(400, "Missing prompt", "missing-prompt");
  if (!body.clipId) throw new ApiError(400, "Missing clipId", "missing-clip");
  if (!getReplicateTokenForGeneration()) throw new ApiError(503, "AI Edit is not configured on this server", "replicate-not-configured");

  const paths = ensureProjectDirs(bpProjectId);
  if (!fs.existsSync(paths.projectFile)) throw new ApiError(404, "Project not found", "project-missing");
  const project = deserializeProject(fs.readFileSync(paths.projectFile, "utf-8"));
  const found = findClip(project, body.clipId);
  if (!found) throw new ApiError(404, "Clip not found", "clip-missing");
  const asset = findAsset(project, found.clip.assetId);
  if (!asset || asset.kind !== "video") throw new ApiError(400, "This edits video clips", "not-a-video");
  const seconds = found.clip.sourceOut - found.clip.sourceIn;
  if (seconds > AI_EDIT_VIDEO_MAX_SECONDS + 0.05) {
    throw new ApiError(400, `AI Edit works on video clips up to ${AI_EDIT_VIDEO_MAX_SECONDS} seconds — split this clip first`, "ai-edit-too-long");
  }

  const preserve = (Array.isArray(body.preserve) ? body.preserve : []).filter((k): k is AiEditPreserve => (AI_EDIT_PRESERVE_KEYS as readonly string[]).includes(k));
  const instruction = buildAiEditInstruction(prompt, { preserve, creativity: clampCreativity(body.creativity) }, "video");

  const credits = aiEditVideoCredits(seconds);
  await spend(credits);
  const holdId = await registerHold(user?.id, "ai-edit-video", credits);

  const id = crypto.randomUUID();
  const job = {
    id,
    status: "running" as JobStatus,
    stage: "predicting" as Stage,
    progress: 0,
    spentAmount: credits,
    holdId,
    abortController: new AbortController(),
    ...(user ? { ownerId: user.id } : null),
  } as EditJob;
  const notifier = makeNotifier(job);
  job.changed = notifier.changed;
  job.notify = notifier.notify;
  jobs.set(id, job);

  void runEditJob(job, { bpProjectId, clipId: body.clipId, instruction, prompt, ownerId: user?.id, deliverBytes: Boolean(body.deliverBytes) }).catch(() => {});
  return Response.json({ jobId: id, credits });
});

export const GET = hostedSessionRouteCors(async (req, user) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new ApiError(400, "Missing jobId", "missing-job-id");
  const job = jobs.get(jobId);
  if (!job || (job.ownerId !== undefined && job.ownerId !== (user?.id ?? null))) throw new ApiError(404, "That job is no longer running", "job-missing");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = () => {
        const payload = {
          status: job.status,
          stage: job.stage,
          progress: job.progress,
          ...(job.error ? { error: job.error } : null),
          ...(job.asset ? { asset: job.asset } : null),
          ...(job.bytesBase64 ? { bytesBase64: job.bytesBase64 } : null),
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      send();
      while (job.status === "running") {
        await job.changed;
        send();
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
});

export const DELETE = hostedSessionRouteCors(async (req, user) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new ApiError(400, "Missing jobId", "missing-job-id");
  const job = jobs.get(jobId);
  if (!job || (job.ownerId !== undefined && job.ownerId !== (user?.id ?? null))) throw new ApiError(404, "That job is no longer running", "job-missing");
  if (job.status === "running") job.abortController.abort();
  return Response.json({ ok: true });
});

export const OPTIONS = corsPreflight;
