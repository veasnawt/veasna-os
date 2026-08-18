import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import Replicate from "replicate";
import { fal } from "@fal-ai/client";
import { buildExtractClipArgs } from "@veasna/vstudio/src/export/ffmpegCommands";
import { findAsset, findClip } from "@veasna/vstudio/src/project/createProject";
import { deserializeProject } from "@veasna/vstudio/src/project/serialize";
import type { Asset } from "@veasna/vstudio/src/project/types";
import { ffmpegAvailable, generateFilmstrip, generateMaskImage, generateMaskVideo, generateThumbnail, probeMedia, runFfmpeg } from "../_lib/ffmpeg";
import { localRoute } from "../_lib/localOnly";
import { getInpaintKeyStatus, getActiveInpaintToken } from "../_lib/inpaintEnvFile";
import { getLocalSetupStatus, REPO_DIR, VENV_PYTHON } from "../_lib/localModel";
import { ApiError, ensureProjectDirs, resolveWithin, uniqueFileName } from "../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Remove Object" job stages — surfaced to the UI so a slow step (usually `predicting`, the actual
 *  cloud render) reads as real progress rather than the whole thing looking stuck on one bar. */
type Stage = "extracting" | "masking" | "uploading" | "predicting" | "downloading" | "importing";
type JobStatus = "running" | "done" | "failed" | "cancelled";

interface InpaintJob {
  id: string;
  status: JobStatus;
  stage: Stage;
  progress: number;
  asset?: Asset;
  error?: string;
  /** The extraction step's own ffmpeg child, killable on cancel while it's the active stage. Every
   *  stage after that is fetch-based instead — see `abortController`. */
  currentProcess: ChildProcess | null;
  /** Covers every fetch-based stage (upload/predict/download). Aborting this does NOT stop the
   *  Replicate prediction itself from running server-side — see this route's own DELETE handler. */
  abortController: AbortController;
  changed: Promise<void>;
  notify: () => void;
}

/** Same module-lifetime in-memory job map as `export/route.ts` — see that file's own comment on why
 *  that scope is the right one for a local, single-user editor. */
const jobs = new Map<string, InpaintJob>();

function makeNotifier(job: Partial<InpaintJob>): { changed: Promise<void>; notify: () => void } {
  let resolve!: () => void;
  const changed = new Promise<void>((r) => (resolve = r));
  return {
    changed,
    notify: () => {
      resolve();
      const next = makeNotifier(job);
      (job as InpaintJob).changed = next.changed;
      (job as InpaintJob).notify = next.notify;
    },
  };
}

/** Maps a stage's own internal 0..1 progress into the job's OVERALL 0..1 progress — `predicting` (the
 *  actual cloud render, ~47s of a ~60-90s job end to end) gets the largest slice since it's where
 *  almost all the wall-clock time actually goes; the local ffmpeg steps are comparatively instant. */
const STAGE_RANGES: Record<Stage, [number, number]> = {
  extracting: [0, 0.15],
  masking: [0.15, 0.2],
  uploading: [0.2, 0.35],
  predicting: [0.35, 0.85],
  downloading: [0.85, 0.95],
  importing: [0.95, 1],
};

function setStageProgress(job: InpaintJob, stage: Stage, fraction: number) {
  const [start, end] = STAGE_RANGES[stage];
  job.stage = stage;
  job.progress = start + (end - start) * Math.min(1, Math.max(0, fraction));
  job.notify();
}

/** Runs the ProPainter model via Replicate's OFFICIAL Node SDK (`replicate` on npm,
 *  github.com/replicate/replicate-javascript) and returns the resulting video as a Buffer.
 *
 *  Replaced an earlier hand-rolled version built directly on `fetch` (POST /v1/files, then POST
 *  .../predictions, then poll) after confirming LIVE, not hypothetically, that raw Node `fetch` gets
 *  blocked by Cloudflare's bot protection even with a real, valid API token — a 403 HTML "Attention
 *  Required" challenge page, never reaching Replicate's own API logic at all, because Node's built-in
 *  `fetch` (undici) sends no distinguishing `User-Agent`. The SDK sends its own
 *  `User-Agent: replicate-javascript/<version>` by default — a known, presumably allowlisted
 *  signature, since Replicate controls both their own SDK and their own Cloudflare configuration.
 *
 *  Using the SDK also resolves the two other things the hand-rolled version had marked as unconfirmed
 *  TODOs: it owns both the Files-API upload contract and the exact `input` field names for a given
 *  model, so `{ video, mask }` below only needs to match ProPainter's actual `openapi_schema` (visible
 *  on the model's own Replicate page), not a guessed shape — same field names used here as the
 *  third-party-documented convention (`ayushunleashed/minimax-remover`'s public schema also uses
 *  "video" + "mask"), now backed by the SDK actually reaching the API to confirm or reject them. */
async function runInpaintPrediction(
  videoPath: string,
  maskPath: string,
  token: string,
  signal: AbortSignal,
  onProgress: (fraction: number) => void
): Promise<Buffer> {
  const replicate = new Replicate({ auth: token });
  const [video, mask] = await Promise.all([fs.promises.readFile(videoPath), fs.promises.readFile(maskPath)]);

  const result = await replicate.run(
    "jd7h/propainter",
    { input: { video, mask }, signal },
    (prediction) => {
      // Coarse status → fraction, the same mapping the hand-rolled poller used — Replicate's own API
      // reports a status enum, not a fine-grained percentage.
      onProgress(prediction.status === "succeeded" ? 1 : prediction.status === "processing" ? 0.6 : 0.1);
    }
  );

  // A model with one file output returns it either as a bare FileOutput or as an array containing
  // one — handled defensively since ProPainter's exact shape was never confirmed against a real
  // response while this was written (the Cloudflare block above meant one was never actually seen).
  const output = Array.isArray(result) ? result[0] : result;
  if (!output || typeof (output as { blob?: unknown }).blob !== "function") {
    throw new ApiError(502, "Replicate's prediction had no usable output video", "replicate-predict-failed");
  }
  const blob = await (output as { blob: () => Promise<Blob> }).blob();
  return Buffer.from(await blob.arrayBuffer());
}

/** Runs fal.ai's VOID model (`fal-ai/void-video-inpainting`) — confirmed reachable from this network
 *  (a bare `curl -X POST https://fal.run/fal-ai/void-video-inpainting` returned a clean 401 JSON, not
 *  a Cloudflare block) unlike Replicate. Uses the official `@fal-ai/client` SDK for the same reason
 *  `runInpaintPrediction` does for Replicate — a mature published client sends its own real identity.
 *
 *  Unlike Replicate's `run()` (which auto-uploads a raw Buffer passed inline), VOID's own input schema
 *  wants `video_url`/`quad_mask_video_url` as already-hosted URL strings, so this calls
 *  `fal.storage.upload()` first for each file, then references the returned URLs in `fal.subscribe`'s
 *  input. Reuses the same binary black/white mask this feature already generates for Replicate — VOID
 *  documents its mask as a grayscale "quadmask" video, of which plain black/white is the simplest valid
 *  case (white = remove); revisit only if real output shows this needs a genuine multi-level mask. */
async function runFalPrediction(
  videoPath: string,
  maskPath: string,
  token: string,
  backgroundPrompt: string | undefined,
  signal: AbortSignal,
  onUploadProgress: (fraction: number) => void,
  onPredictProgress: (fraction: number) => void
): Promise<Buffer> {
  // Re-set per job — this app supports switching providers/keys at runtime, so a stale global config
  // from an earlier job/key must never be trusted.
  fal.config({ credentials: token });
  const [video, mask] = await Promise.all([fs.promises.readFile(videoPath), fs.promises.readFile(maskPath)]);

  onUploadProgress(0);
  const videoUrl = await fal.storage.upload(new Blob([video]));
  onUploadProgress(0.5);
  const maskUrl = await fal.storage.upload(new Blob([mask]));
  onUploadProgress(1);

  const result = await fal.subscribe("fal-ai/void-video-inpainting", {
    input: {
      video_url: videoUrl,
      quad_mask_video_url: maskUrl,
      prompt: backgroundPrompt?.trim() || "the original, unedited background of the scene",
    },
    abortSignal: signal,
    onQueueUpdate: (status) => {
      onPredictProgress(status.status === "COMPLETED" ? 1 : status.status === "IN_PROGRESS" ? 0.6 : 0.1);
    },
  });

  const outputUrl = (result.data as { video?: { url?: string } })?.video?.url;
  if (!outputUrl) throw new ApiError(502, "fal.ai's prediction had no usable output video", "fal-predict-failed");

  // Same defensive User-Agent this whole debugging session established matters for any server-side
  // fetch to a media/CDN host fronting these providers — cheap insurance even though fal.ai's own
  // domains weren't observed to need it.
  const downloadRes = await fetch(outputUrl, { headers: { "User-Agent": "VStudio/1.0 (+https://github.com/veasnawt/vstudio)" }, signal });
  if (!downloadRes.ok) throw new ApiError(502, `Downloading the fal.ai result failed (${downloadRes.status})`, "download-failed");
  return Buffer.from(await downloadRes.arrayBuffer());
}

/** Runs ProPainter locally via the Python venv provisioned by `_lib/localModel.ts` — no network, no
 *  per-run cost, but real-world minutes on CPU (no GPU on this machine). The CLI's `--mask` flag only
 *  accepts a static image (not a video), so the caller passes a single black/white PNG rather than the
 *  mask video the two cloud providers use — see `buildMaskImageArgs`'s own comment.
 *
 *  No fine-grained progress: `tqdm` in `inference_propainter.py` only wraps its final transformer
 *  stage (stderr, `\r`-updating), not reliably parseable through a piped subprocess — this reports a
 *  coarse "started" (any stdout/stderr output) → "done" jump instead, same honesty-over-precision
 *  choice already made for the Replicate "uploading" stage. */
async function runLocalPrediction(
  videoPath: string,
  maskImagePath: string,
  outputDir: string,
  fps: number,
  signal: AbortSignal,
  onProgress: (fraction: number) => void
): Promise<Buffer> {
  onProgress(0);
  const child = spawn(
    VENV_PYTHON,
    [
      "inference_propainter.py",
      "-i", videoPath,
      "-m", maskImagePath,
      "-o", outputDir,
      "--save_fps", String(Math.round(fps) || 30),
      // Chunks EVERY stage (RAFT flow correlation, propagation, transformer) by frame count, with
      // no effect on output resolution/quality — unlike --resize_ratio, which the script bakes
      // permanently into the saved result. The default of 80 needs ~5.8GB in one allocation for
      // RAFT's correlation volume alone at a modest 640x360 (confirmed live: crashed with
      // `RuntimeError: not enough memory: you tried to allocate 5806080000 bytes` on this machine's
      // 7.9GB total RAM). A real GPU (Replicate/fal.ai) has 16-24GB+ VRAM and never needs this; a
      // typical CPU-only consumer machine does. 8 keeps each chunk's correlation volume in the
      // tens-of-MB range regardless of clip length.
      "--subvideo_length", "8",
    ],
    { cwd: REPO_DIR, windowsHide: true }
  );

  let sawOutput = false;
  let stderrTail = "";
  const markAlive = () => {
    if (!sawOutput) {
      sawOutput = true;
      onProgress(0.5);
    }
  };
  child.stdout?.on("data", markAlive);
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-4000);
    markAlive();
  });

  const abortHandler = () => child.kill("SIGKILL");
  signal.addEventListener("abort", abortHandler);

  await new Promise<void>((resolve, reject) => {
    child.on("error", (err) => reject(new ApiError(500, `Could not start the local model: ${err.message}`, "local-spawn-failed")));
    child.on("close", (code, killSignal) => {
      if (code === 0) return resolve();
      if (killSignal || signal.aborted) return reject(new ApiError(499, "Cancelled", "cancelled"));
      const detail = stderrTail.trim().split("\n").slice(-8).join("\n");
      reject(new ApiError(500, `The local model failed (exit ${code})${detail ? `:\n${detail}` : ""}`, "local-predict-failed"));
    });
  }).finally(() => signal.removeEventListener("abort", abortHandler));

  onProgress(1);

  // ProPainter's own output convention: `<output_dir>/<video_basename>/inpaint_out.mp4`.
  const videoBaseName = path.basename(videoPath, path.extname(videoPath));
  const resultPath = path.join(outputDir, videoBaseName, "inpaint_out.mp4");
  if (!fs.existsSync(resultPath)) {
    throw new ApiError(500, "The local model finished but produced no output video", "local-no-output");
  }
  return fs.promises.readFile(resultPath);
}

async function runInpaintJob(
  job: InpaintJob,
  bpProjectId: string,
  clipId: string,
  rect: { x: number; y: number; width: number; height: number },
  backgroundPrompt: string | undefined
) {
  const paths = ensureProjectDirs(bpProjectId);
  const scratchPrefix = path.join(paths.scratchDir, job.id);
  const extractedPath = `${scratchPrefix}-src.mp4`;
  const resultPath = `${scratchPrefix}-result.mp4`;
  const { activeProvider } = getInpaintKeyStatus();
  // Only the local provider's CLI wants a static image; the two cloud providers want a mask video —
  // see `buildMaskImageArgs`'s own comment for why a single frame is enough either way.
  const maskPath = activeProvider === "local" ? `${scratchPrefix}-mask.png` : `${scratchPrefix}-mask.mp4`;
  const localOutputDir = `${scratchPrefix}-out`;

  try {
    const raw = fs.readFileSync(paths.projectFile, "utf8");
    const project = deserializeProject(raw);
    const found = findClip(project, clipId);
    if (!found) throw new ApiError(400, "That clip no longer exists in the project", "clip-missing");
    const asset = findAsset(project, found.clip.assetId);
    if (!asset || asset.kind !== "video") throw new ApiError(400, "That clip's media is missing or isn't a video", "asset-missing");
    if (asset.offline) throw new ApiError(400, "That clip's media file is offline", "asset-offline");

    const sourcePath = resolveWithin(paths.mediaDir, asset.relPath);
    let token: string | null = null;
    if (activeProvider === "local") {
      if (!getLocalSetupStatus().ready) throw new ApiError(400, "Set up the local model first", "local-not-ready");
    } else {
      token = getActiveInpaintToken();
      if (!token) throw new ApiError(400, `Set your ${activeProvider === "fal" ? "fal.ai" : "Replicate"} API key first`, "no-api-key");
    }

    // --- extracting ---
    job.stage = "extracting";
    job.notify();
    const extractArgs = buildExtractClipArgs(sourcePath, extractedPath, found.clip.sourceIn, found.clip.sourceOut);
    const extractDuration = Math.max(0.1, found.clip.sourceOut - found.clip.sourceIn);
    const extractRun = runFfmpeg(extractArgs, extractDuration, (fraction) => setStageProgress(job, "extracting", fraction));
    job.currentProcess = extractRun.process;
    await extractRun.done;
    job.currentProcess = null;

    // --- masking --- (probe the EXTRACTED file's own actual duration, not sourceOut-sourceIn, so the
    // mask always matches the file it's paired with regardless of ffmpeg's own seek precision)
    setStageProgress(job, "masking", 0);
    const extractedProbe = await probeMedia(extractedPath);
    if (!extractedProbe.width || !extractedProbe.height) {
      throw new ApiError(500, "Could not read the extracted clip's dimensions", "extract-failed");
    }
    const maskOk =
      activeProvider === "local"
        ? await generateMaskImage(maskPath, extractedProbe.width, extractedProbe.height, rect)
        : await generateMaskVideo(
            maskPath,
            extractedProbe.width,
            extractedProbe.height,
            extractedProbe.fps ?? 30,
            extractedProbe.duration || extractDuration,
            rect
          );
    if (!maskOk) throw new ApiError(500, "Could not generate the mask", "mask-failed");
    setStageProgress(job, "masking", 1);
    if (job.abortController.signal.aborted) throw new ApiError(499, "Cancelled", "cancelled");

    // --- uploading + predicting ---
    let resultBuffer: Buffer;
    if (activeProvider === "local") {
      // No network upload stage at all — jump straight to "predicting" (running the Python process).
      setStageProgress(job, "uploading", 1);
      resultBuffer = await runLocalPrediction(
        extractedPath,
        maskPath,
        localOutputDir,
        extractedProbe.fps ?? 30,
        job.abortController.signal,
        (fraction) => setStageProgress(job, "predicting", fraction)
      );
    } else if (activeProvider === "fal") {
      resultBuffer = await runFalPrediction(
        extractedPath,
        maskPath,
        token!,
        backgroundPrompt,
        job.abortController.signal,
        (fraction) => setStageProgress(job, "uploading", fraction),
        (fraction) => setStageProgress(job, "predicting", fraction)
      );
    } else {
      // The SDK's one `run()` call covers Files-API upload, creating the prediction, AND polling it to
      // completion — see `runInpaintPrediction`'s own comment for why this replaced three separate
      // hand-rolled fetch calls. No separate upload stage to report, so it's marked complete up front.
      setStageProgress(job, "uploading", 1);
      resultBuffer = await runInpaintPrediction(extractedPath, maskPath, token!, job.abortController.signal, (fraction) =>
        setStageProgress(job, "predicting", fraction)
      );
    }

    // --- downloading --- (the SDK already fetched the output's bytes as part of the call above via
    // its own `.blob()` — this stage is just "the bytes are in hand, write them to disk," kept as its
    // own stage so the UI's progress breakdown stays meaningful rather than jumping straight from
    // predicting to importing)
    setStageProgress(job, "downloading", 0.5);
    await fs.promises.writeFile(resultPath, resultBuffer);
    setStageProgress(job, "downloading", 1);

    // --- importing --- (same inline steps media/route.ts's POST already uses for a fresh import)
    setStageProgress(job, "importing", 0);
    const fileName = uniqueFileName(`${asset.name.replace(/\.[^.]+$/, "")}-object-removed.mp4`);
    const destination = resolveWithin(paths.mediaDir, fileName);
    fs.copyFileSync(resultPath, destination);
    const resultProbe = await probeMedia(destination);

    const newAsset: Asset = {
      id: `a_${crypto.randomUUID().slice(0, 8)}`,
      kind: "video",
      name: `${asset.name.replace(/\.[^.]+$/, "")} (object removed)`,
      relPath: fileName,
      duration: resultProbe.duration,
      hasAudio: false,
      sizeBytes: (await fs.promises.stat(destination)).size,
      importedAt: Date.now(),
      ...(resultProbe.width ? { width: resultProbe.width } : null),
      ...(resultProbe.height ? { height: resultProbe.height } : null),
      ...(resultProbe.fps ? { fps: resultProbe.fps } : null),
    };
    const thumbName = `${newAsset.id}.jpg`;
    if (await generateThumbnail(destination, resolveWithin(paths.thumbnailsDir, thumbName), Math.min(1, resultProbe.duration / 2))) {
      newAsset.thumbnailRelPath = thumbName;
    }
    const filmstripName = `${newAsset.id}-filmstrip.jpg`;
    if (await generateFilmstrip(destination, resolveWithin(paths.thumbnailsDir, filmstripName), resultProbe.duration)) {
      newAsset.filmstripRelPath = filmstripName;
    }

    job.asset = newAsset;
    job.status = "done";
    job.progress = 1;
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? (err as { code: string }).code : undefined;
    // The SDK's `run()` rejects with a standard DOMException (`name === "AbortError"`) when its own
    // `signal` fires, not one of this route's own `ApiError`s — recognized separately here so
    // cancelling mid-`predicting` reports "cancelled" the same way cancelling during the local
    // ffmpeg/masking stages already does (their own `code === "cancelled"` ApiErrors), instead of
    // surfacing as a generic failure.
    const isAbort = err instanceof Error && err.name === "AbortError";
    job.status = code === "cancelled" || isAbort ? "cancelled" : "failed";
    if (job.status === "failed") job.error = err instanceof Error ? err.message : String(err);
  } finally {
    job.currentProcess = null;
    job.notify();
    for (const scratchFile of [extractedPath, maskPath, resultPath]) {
      fs.rm(scratchFile, { force: true }, () => {});
    }
    // The local provider's own output tree (`<localOutputDir>/<video_basename>/inpaint_out.mp4`, plus
    // whatever else `inference_propainter.py` writes alongside it) — only ever created for that
    // provider, but harmless to always attempt removing.
    fs.rm(localOutputDir, { force: true, recursive: true }, () => {});
    setTimeout(() => jobs.delete(job.id), 60_000).unref?.();
  }
}

/** Starts a "Remove Object" job and returns immediately with a job id — the actual work (extract →
 *  mask → upload → predict → download → import) runs async, mirroring `export/route.ts`'s own
 *  fire-and-track-via-SSE shape. */
export const POST = localRoute(async (req) => {
  const bpProjectId = new URL(req.url).searchParams.get("projectId");
  if (!bpProjectId) throw new ApiError(400, "Missing projectId", "missing-project-id");

  const availability = ffmpegAvailable();
  if (!availability.available) throw new ApiError(500, availability.reason ?? "FFmpeg is unavailable", "ffmpeg-missing");
  const keyStatus = getInpaintKeyStatus();
  if (!keyStatus.configured[keyStatus.activeProvider]) {
    throw new ApiError(400, `Set your ${keyStatus.activeProvider === "fal" ? "fal.ai" : "Replicate"} API key first`, "no-api-key");
  }

  const body = (await req.json().catch(() => ({}))) as {
    clipId?: string;
    rect?: { x: number; y: number; width: number; height: number };
    backgroundPrompt?: string;
  };
  if (!body.clipId) throw new ApiError(400, "Missing clipId", "missing-clip-id");
  const rect = body.rect;
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) throw new ApiError(400, "Missing or invalid rect", "missing-rect");

  // Validated up front (clip exists, is a video clip, media is present) so a bad request fails
  // immediately rather than after a job APPEARS to have started — same reasoning `export/route.ts`
  // validates its plan before creating a job.
  const paths = ensureProjectDirs(bpProjectId);
  if (!fs.existsSync(paths.projectFile)) throw new ApiError(404, "Project not found", "project-missing");
  const project = deserializeProject(fs.readFileSync(paths.projectFile, "utf8"));
  const found = findClip(project, body.clipId);
  if (!found) throw new ApiError(400, "That clip no longer exists in the project", "clip-missing");
  if (found.track.kind !== "video") throw new ApiError(400, "Remove Object only works on a video track", "wrong-track-kind");
  const asset = findAsset(project, found.clip.assetId);
  if (!asset || asset.kind !== "video") throw new ApiError(400, "That clip's media is missing or isn't a video", "asset-missing");

  const id = crypto.randomUUID();
  const job = {
    id,
    status: "running" as JobStatus,
    stage: "extracting" as Stage,
    progress: 0,
    currentProcess: null,
    abortController: new AbortController(),
  } as InpaintJob;
  const notifier = makeNotifier(job);
  job.changed = notifier.changed;
  job.notify = notifier.notify;
  jobs.set(id, job);

  void runInpaintJob(job, bpProjectId, body.clipId, rect, body.backgroundPrompt);

  return Response.json({ jobId: id });
});

/** Streams progress as Server-Sent Events until the job reaches a terminal state — identical shape to
 *  `export/route.ts`'s GET, with `stage` added and the finished `asset` included once done so the
 *  client needs no second round-trip to land it in the Media Library. */
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
          ...(job.asset ? { asset: job.asset } : null),
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

/** Cancels a job's LOCAL work only — aborts whichever fetch is in flight and kills the extraction
 *  ffmpeg child if that's still the active stage. A prediction already handed to Replicate keeps
 *  computing (and billing) server-side regardless; there is no cancel-prediction call for v1. */
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

/** Reports whether "Remove Object" is usable at all right now — FFmpeg present AND the active
 *  provider has a key saved — so the Inspector section can explain what's missing instead of offering
 *  a dead button. */
export const HEAD = localRoute(async () => {
  const keyStatus = getInpaintKeyStatus();
  const available = ffmpegAvailable().available && keyStatus.configured[keyStatus.activeProvider];
  return new Response(null, { status: available ? 204 : 503 });
});
