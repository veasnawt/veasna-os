import fs from "fs";
import path from "path";
import { buildAudioOnlyExportPlan } from "@veasnawt/vcut/src/export/buildAudioOnlyExportPlan";
import { trimProjectToRange } from "@veasnawt/vcut/src/export/trimForExport";
import { clipDuration, findAsset, findClip, sequenceDuration } from "@veasnawt/vcut/src/project/createProject";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import { ffmpegAvailable, runFfmpeg } from "../_lib/ffmpeg";
import { getCaptionsApiKey, getCaptionsKeyStatus } from "../_lib/captionsEnvFile";
import { localRoute } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs, resolveWithin } from "../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Auto Captions job stages — mirrors "Remove Object"'s own `Stage`/progress shape
 *  (`inpaint/route.ts`), just with this feature's own three steps. `transcribing` (the one external
 *  network call) gets the largest slice, same "the slow step reads as real progress" reasoning. */
type Stage = "extracting-audio" | "transcribing" | "building-captions";
type JobStatus = "running" | "done" | "failed" | "cancelled";

interface CaptionSegment {
  content: string;
  /** Absolute sequence-timeline seconds — already shifted back from "relative to the uploaded audio
   *  file" by the job's own range start, so the client can place these directly with no further math.
   *  See `runCaptionsJob`'s own comment on why this offset is the one detail that makes per-clip and
   *  whole-sequence share this same code path correctly. */
  start: number;
  end: number;
}

interface CaptionsJob {
  id: string;
  status: JobStatus;
  stage: Stage;
  progress: number;
  captions?: CaptionSegment[];
  error?: string;
  /** The extraction step's own ffmpeg child, killable on cancel while it's the active stage — same
   *  role as `InpaintJob.currentProcess`. */
  currentProcess: import("child_process").ChildProcess | null;
  /** Covers the transcription fetch. Aborting this does NOT stop OpenAI from having already received
   *  the upload if the request was already in flight past the point of no return — same "no true
   *  remote-cancel" limitation `inpaint/route.ts`'s own `abortController` has for Replicate/fal. */
  abortController: AbortController;
  changed: Promise<void>;
  notify: () => void;
}

/** Same module-lifetime in-memory job map as `inpaint/route.ts`/`export/route.ts` — see their own
 *  comments on why that scope is right for a local, single-user editor. Not a shared import (each
 *  route keeps its own small copy of this notifier plumbing — same established pattern
 *  `captionsEnvFile.ts` follows for the env file it reads). */
const jobs = new Map<string, CaptionsJob>();

function makeNotifier(job: Partial<CaptionsJob>): { changed: Promise<void>; notify: () => void } {
  let resolve!: () => void;
  const changed = new Promise<void>((r) => (resolve = r));
  return {
    changed,
    notify: () => {
      resolve();
      const next = makeNotifier(job);
      (job as CaptionsJob).changed = next.changed;
      (job as CaptionsJob).notify = next.notify;
    },
  };
}

const STAGE_RANGES: Record<Stage, [number, number]> = {
  "extracting-audio": [0, 0.2],
  transcribing: [0.2, 0.9],
  "building-captions": [0.9, 1],
};

function setStageProgress(job: CaptionsJob, stage: Stage, fraction: number) {
  const [start, end] = STAGE_RANGES[stage];
  job.stage = stage;
  job.progress = start + (end - start) * Math.min(1, Math.max(0, fraction));
  job.notify();
}

/** OpenAI's `verbose_json` transcription response — only the fields this route actually reads. */
interface WhisperResponse {
  segments?: { start: number; end: number; text: string }[];
}

async function runCaptionsJob(job: CaptionsJob, bpProjectId: string, rangeStart: number, rangeEnd: number) {
  const paths = ensureProjectDirs(bpProjectId);
  const audioPath = path.join(paths.scratchDir, `${job.id}-audio.mp3`);

  try {
    const project = deserializeProject(fs.readFileSync(paths.projectFile, "utf8"));
    // A no-op for the whole-sequence case (rangeStart=0, rangeEnd=the project's own full duration) —
    // see `trimProjectToRange`'s own doc comment. This one call is what makes per-clip and
    // whole-sequence share every stage below identically.
    const trimmed = trimProjectToRange(project, rangeStart, rangeEnd);

    // --- extracting-audio ---
    job.stage = "extracting-audio";
    job.notify();
    const plan = buildAudioOnlyExportPlan(trimmed, {
      inputPathFor: (assetId) => {
        const asset = findAsset(trimmed, assetId);
        if (!asset) throw new ApiError(400, "A clip references media that is no longer in the project", "missing-asset");
        return resolveWithin(paths.mediaDir, asset.relPath);
      },
      outputPath: audioPath,
    });
    const extractRun = runFfmpeg(plan.args, plan.duration, (fraction) => setStageProgress(job, "extracting-audio", fraction));
    job.currentProcess = extractRun.process;
    await extractRun.done;
    job.currentProcess = null;
    if (job.abortController.signal.aborted) throw new ApiError(499, "Cancelled", "cancelled");

    // --- transcribing ---
    setStageProgress(job, "transcribing", 0);
    const apiKey = getCaptionsApiKey();
    if (!apiKey) throw new ApiError(400, "Set your OpenAI API key first", "no-api-key");

    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(audioPath)], { type: "audio/mpeg" }), "audio.mp3");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");

    setStageProgress(job, "transcribing", 0.3);
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: job.abortController.signal,
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      const message =
        (detail && typeof detail === "object" && "error" in detail && (detail.error as { message?: string })?.message) ||
        `OpenAI's transcription request failed (${response.status})`;
      throw new ApiError(502, message, "whisper-failed");
    }
    const data = (await response.json()) as WhisperResponse;
    setStageProgress(job, "transcribing", 1);

    // --- building-captions ---
    setStageProgress(job, "building-captions", 0);
    // Whisper's own segment timestamps are relative to the uploaded (already-trimmed) audio file —
    // `rangeStart +` is what converts them back to absolute sequence-timeline seconds. A no-op for
    // whole-sequence (rangeStart === 0), the exact same offset `trimProjectToRange` itself undid when
    // it shifted the trimmed project's own timeline zero — this is the one place that shift has to be
    // added back, or per-clip captions would all land at the project's start instead of the clip's own
    // position.
    const captions: CaptionSegment[] = (data.segments ?? [])
      .map((s) => ({ content: s.text.trim(), start: rangeStart + s.start, end: rangeStart + s.end }))
      .filter((c) => c.content.length > 0 && c.end > c.start);

    job.captions = captions;
    job.status = "done";
    job.progress = 1;
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? (err as { code: string }).code : undefined;
    const isAbort = err instanceof Error && err.name === "AbortError";
    job.status = code === "cancelled" || isAbort ? "cancelled" : "failed";
    if (job.status === "failed") job.error = err instanceof Error ? err.message : String(err);
  } finally {
    job.currentProcess = null;
    job.notify();
    fs.rm(audioPath, { force: true }, () => {});
    setTimeout(() => jobs.delete(job.id), 60_000).unref?.();
  }
}

/** Starts an Auto Captions job and returns immediately with a job id — mirrors `inpaint/route.ts`'s
 *  own fire-and-track-via-SSE shape. `clipId` present = per-clip (transcribe just that clip's own
 *  on-screen time range); absent = whole sequence. */
export const POST = localRoute(async (req) => {
  const bpProjectId = new URL(req.url).searchParams.get("projectId");
  if (!bpProjectId) throw new ApiError(400, "Missing projectId", "missing-project-id");

  const availability = ffmpegAvailable();
  if (!availability.available) throw new ApiError(500, availability.reason ?? "FFmpeg is unavailable", "ffmpeg-missing");
  if (!getCaptionsKeyStatus().configured) throw new ApiError(400, "Set your OpenAI API key first", "no-api-key");

  const body = (await req.json().catch(() => ({}))) as { clipId?: string };

  const paths = ensureProjectDirs(bpProjectId);
  if (!fs.existsSync(paths.projectFile)) throw new ApiError(404, "Project not found", "project-missing");
  const project = deserializeProject(fs.readFileSync(paths.projectFile, "utf8"));

  let rangeStart: number;
  let rangeEnd: number;
  if (body.clipId) {
    const found = findClip(project, body.clipId);
    if (!found) throw new ApiError(400, "That clip no longer exists in the project", "clip-missing");
    const asset = findAsset(project, found.clip.assetId);
    if (!asset?.hasAudio) throw new ApiError(400, "That clip has no audio to transcribe", "no-audio");
    rangeStart = found.clip.timelineStart;
    rangeEnd = rangeStart + clipDuration(found.clip);
  } else {
    rangeStart = 0;
    rangeEnd = sequenceDuration(project);
  }
  if (rangeEnd <= rangeStart) throw new ApiError(400, "There is nothing on the timeline to transcribe", "empty-range");

  const id = crypto.randomUUID();
  const job = {
    id,
    status: "running" as JobStatus,
    stage: "extracting-audio" as Stage,
    progress: 0,
    currentProcess: null,
    abortController: new AbortController(),
  } as CaptionsJob;
  const notifier = makeNotifier(job);
  job.changed = notifier.changed;
  job.notify = notifier.notify;
  jobs.set(id, job);

  void runCaptionsJob(job, bpProjectId, rangeStart, rangeEnd).catch(() => {
    // runCaptionsJob already handles its own errors internally (job.status/error) — this catch exists
    // only to guarantee an unexpected throw inside it can never become an unhandled rejection.
  });

  return Response.json({ jobId: id });
});

/** Streams progress as Server-Sent Events until the job reaches a terminal state — identical shape to
 *  `inpaint/route.ts`'s GET, with `captions` included once done so the client needs no second
 *  round-trip before landing them on the timeline. */
export const GET = localRoute(async (req) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new ApiError(400, "Missing jobId", "missing-job-id");
  const job = jobs.get(jobId);
  if (!job) throw new ApiError(404, "That job is no longer running", "job-missing");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = () => {
        const payload = {
          status: job.status,
          stage: job.stage,
          progress: job.progress,
          ...(job.error ? { error: job.error } : null),
          ...(job.captions ? { captions: job.captions } : null),
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

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

/** Cancels a job's LOCAL work only — kills the extraction ffmpeg child if that's still the active
 *  stage, aborts the transcription fetch if that's in flight. Same "no true remote-cancel" limitation
 *  `inpaint/route.ts`'s own DELETE has. */
export const DELETE = localRoute(async (req) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new ApiError(400, "Missing jobId", "missing-job-id");
  const job = jobs.get(jobId);
  if (!job) throw new ApiError(404, "That job is no longer running", "job-missing");

  if (job.status === "running") {
    job.currentProcess?.kill("SIGKILL");
    job.abortController.abort();
  }
  return Response.json({ ok: true });
});

/** Reports whether Auto Captions is usable right now — FFmpeg present AND an OpenAI key saved. */
export const HEAD = localRoute(async () => {
  const available = ffmpegAvailable().available && getCaptionsKeyStatus().configured;
  return new Response(null, { status: available ? 204 : 503 });
});
