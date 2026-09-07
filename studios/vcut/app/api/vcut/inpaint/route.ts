import { execFile, spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import Replicate from "replicate";
import { fal } from "@fal-ai/client";
import { buildExtractClipArgs } from "@veasnawt/vcut/src/export/ffmpegCommands";
import { findAsset, findClip } from "@veasnawt/vcut/src/project/createProject";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import type { Asset } from "@veasnawt/vcut/src/project/types";
import { ffmpegAvailable, ffmpegBinary, generateFilmstrip, generateMaskImage, generateMaskVideo, generateThumbnail, probeMedia, runFfmpeg } from "../_lib/ffmpeg";
import { VCUT_HOSTED } from "../_lib/auth";
import { refundCredits } from "../_lib/credits";
import { hostedCreditGatedRoute, hostedSessionRoute } from "../_lib/localOnly";
import { getInpaintKeyStatus, getActiveInpaintToken } from "../_lib/inpaintEnvFile";
import { getLocalSetupStatus, REPO_DIR, VENV_PYTHON } from "../_lib/localModel";
import { ApiError, ensureProjectDirs, resolveWithin, uniqueFileName } from "../_lib/paths";
import { HOSTED_ORIGIN } from "../_lib/stripe";

/** Credits per second of a Remove Object job's OUTPUT video (rounded up) — `bria/video-erase-object`
 *  itself bills Replicate usage at $0.05/second of generated output, so pricing per second here
 *  (rather than a flat per-job or per-5-second-chunk rate) tracks real cost proportionally instead of
 *  over-charging a short clip to subsidize a long one, or under-charging a clip whose last chunk is
 *  much shorter than 5s (see `runChunkedInpaintPrediction`'s own comment — a 7-second clip actually
 *  costs Replicate for 7 seconds of output, not a flat "2 chunks" rate).
 *
 *  16, not 4: VCut Pro is a $9.99/month subscription (Stripe's own live price, confirmed directly, not
 *  assumed) for `PRO_CREDITS_PER_MONTH` (1200) credits — a Pro account spending its ENTIRE allotment
 *  on nothing but Remove Object is the real worst case to price against, not the average case. This is
 *  a straight 4x scale-up of BOTH the allotment (300→1200) AND this rate (4→16) together, chosen
 *  deliberately to leave the actual real-world entitlement and margin UNCHANGED, not to re-derive a
 *  new one — 300÷4 and 1200÷16 are both exactly 75 seconds × $0.05 = $3.75 of real Replicate cost
 *  against ~$9.40 of net revenue after Stripe's own cut, the same ~60% gross margin floor this rate
 *  was originally chosen to hold (see git history for that original derivation, including the 3/sec
 *  and 5/sec alternatives weighed against it). "More credits" reads as more generous without actually
 *  costing VCut anything more per Pro user than before.
 *
 *  Only meaningful for the "replicate" provider, the one actually billed this way — "local" (free,
 *  runs on this machine's own CPU) and "fal" (a different vendor, no $/second figure confirmed here)
 *  keep the old flat rate below instead. */
const REMOVE_OBJECT_CREDITS_PER_SECOND = 16;

/** Flat per-job cost for the "local"/"fal" providers, which don't bill by output-second the way
 *  `bria/video-erase-object` does — see `REMOVE_OBJECT_CREDITS_PER_SECOND`'s own comment. Same 4x
 *  scale-up (3→12) for consistency with that rate and the new allotments, even though "local" has no
 *  real per-second provider cost to hold a margin against in the first place. */
const REMOVE_OBJECT_FLAT_COST = 12;

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
  /** `runFfmpeg`'s own `cancel()` for whichever run `currentProcess` currently points at — see that
   *  function's own doc comment for why `DELETE` must go through this rather than killing
   *  `currentProcess` directly (doing so is indistinguishable from the kernel OOM-killer sending the
   *  same signal, and would misreport a hosted OOM as "cancelled" instead of a real failure). */
  currentCancel: (() => void) | null;
  /** Covers every fetch-based stage (upload/predict/download). Aborting this does NOT stop the
   *  Replicate prediction itself from running server-side — see this route's own DELETE handler. */
  abortController: AbortController;
  changed: Promise<void>;
  notify: () => void;
  /** The hosted-mode session user who started this job — `undefined` in local/desktop mode. See
   *  `captions/route.ts`'s identical field for the full reasoning; both features gained this the same
   *  way, at the same time. */
  ownerId?: string;
  /** What `spend()` actually charged for THIS job — for the "replicate" provider, priced per output
   *  second (`REMOVE_OBJECT_CREDITS_PER_SECOND`), not a flat rate; see the `POST` handler's own
   *  comment. A failure refunds exactly this, not a flat constant, so a long clip's refund matches
   *  what it actually paid. */
  spentAmount: number;
}

/** Same module-lifetime in-memory job map as `export/route.ts` — see that file's own comment on why
 *  that scope is the right one for a local, single-user editor. */
const jobs = new Map<string, InpaintJob>();

/** See `captions/route.ts`'s identical helper for the full reasoning — same "404, not 403" contract. */
function assertJobOwnership(job: InpaintJob, userId: string | null): void {
  if (VCUT_HOSTED && job.ownerId !== userId) throw new ApiError(404, "That job is no longer running", "job-missing");
}

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

/** Runs `bria/video-erase-object` via Replicate's OFFICIAL Node SDK (`replicate` on npm,
 *  github.com/replicate/replicate-javascript) and returns the resulting video as a Buffer.
 *
 *  Replaced `jd7h/propainter` (see this repo's own history for the full trail) after THREE
 *  confirmed-live, distinct failures traced to that specific model's own old runtime: Replicate's
 *  Files API upload works fine and produces a correctly `.mp4`-suffixed delivery URL (verified
 *  directly against the real API, not assumed), but ProPainter's own predict.py rejects it anyway;
 *  a data: URI and a self-hosted URL both hit a SEPARATE bug in that model's own generic
 *  file-downloading code (`[Errno 20] Not a directory`) regardless of extension. Fetching
 *  ProPainter's actual `openapi_schema` live confirmed the field names (`video`/`mask`) were never
 *  the issue — the model itself is just broken for any caller besides Replicate's own web playground.
 *
 *  `bria/video-erase-object` is actively maintained (Bria — a commercially-licensed vendor, updated
 *  within the last several months, unlike ProPainter's Oct 2023 snapshot) and its real schema
 *  (fetched live the same way) takes plain `video_url`/`mask_url` STRING fields rather than a
 *  file-upload type. `auto_trim: true` avoids an outright rejection on any clip over the model's own
 *  5-second cap (silently trims instead) — a real, documented limit of this specific model, not
 *  something in our control. `preserve_audio` is left at its own default (`true`) even though it's a
 *  no-op today: the extracted clip this receives has already had its audio stripped by
 *  `buildExtractClipArgs`'s own `-an` (see that function's own reasoning), so there's nothing for
 *  either provider to preserve regardless.
 *
 *  The video/mask URLs themselves are NOT Replicate's own Files API upload (what ProPainter used
 *  successfully) — confirmed LIVE that Bria's own backend can't fetch those: a plain unauthenticated
 *  `curl` to a real uploaded file's own `urls.get` returns 403, and Bria's `video-erase-object`
 *  itself is a partner-hosted integration (Bria's own servers, not literally running inside
 *  Replicate's GPU fleet with implicit access to Replicate's private storage) — so it hit the exact
 *  same 403 fetching it, surfaced as "Failed to load video." `scratch-file/[projectId]/[jobFile]/
 *  route.ts` serves this job's own video/mask scratch files back out over plain HTTPS instead — a
 *  genuinely public URL any external server can fetch with no credential at all. Hosted-mode only:
 *  local/desktop has no publicly-reachable server to host these from, so it falls back to Replicate's
 *  own upload (best effort, matching this route's pre-existing local-mode behavior; not addressed by
 *  this pass since the hosted deployment is what real paying users hit). */
async function runInpaintPrediction(
  bpProjectId: string,
  jobId: string,
  videoPath: string,
  maskPath: string,
  token: string,
  signal: AbortSignal,
  onProgress: (fraction: number) => void
): Promise<Buffer> {
  const replicate = new Replicate({ auth: token });
  const video_url = VCUT_HOSTED
    ? `${HOSTED_ORIGIN}/api/vcut/inpaint/scratch-file/${encodeURIComponent(bpProjectId)}/${jobId}-src.mp4`
    : new File([await fs.promises.readFile(videoPath)], path.basename(videoPath), { type: "video/mp4" });
  const mask_url = VCUT_HOSTED
    ? `${HOSTED_ORIGIN}/api/vcut/inpaint/scratch-file/${encodeURIComponent(bpProjectId)}/${jobId}-mask.mp4`
    : new File([await fs.promises.readFile(maskPath)], path.basename(maskPath), { type: "video/mp4" });

  // Same reasoning as the version-pinning this route used for ProPainter — resolving to the model's
  // own `latest_version.id` and running the classic `owner/name:version` form works regardless of
  // whether a given model happens to support the bare "owner/name" shorthand route.
  const model = await replicate.models.get("bria", "video-erase-object");
  const version = model.latest_version?.id;
  if (!version) throw new ApiError(502, "Replicate's video object-removal model has no runnable version", "replicate-model-unavailable");

  const result = await replicate.run(
    `bria/video-erase-object:${version}`,
    { input: { video_url, mask_url, auto_trim: true }, signal },
    (prediction) => {
      // Coarse status → fraction, the same mapping the hand-rolled poller used — Replicate's own API
      // reports a status enum, not a fine-grained percentage.
      onProgress(prediction.status === "succeeded" ? 1 : prediction.status === "processing" ? 0.6 : 0.1);
    }
  );

  // This model's own `Output` schema is a single URI string, not an array (unlike ProPainter's) —
  // `Array.isArray` here is just defensive in case that ever changes, not evidence it currently does.
  const output = Array.isArray(result) ? result[0] : result;
  if (!output || typeof (output as { blob?: unknown }).blob !== "function") {
    throw new ApiError(502, "Replicate's prediction had no usable output video", "replicate-predict-failed");
  }
  const blob = await (output as { blob: () => Promise<Blob> }).blob();
  return Buffer.from(await blob.arrayBuffer());
}

/** `bria/video-erase-object`'s own hard cap: clips over 5 seconds get silently trimmed to their first
 *  5 (`auto_trim: true`, see `runInpaintPrediction`'s own comment) rather than rejected outright — a
 *  real, documented limit of this specific model, not something any input tweak works around. */
const BRIA_MAX_CHUNK_SECONDS = 5;

/** Splits a clip longer than `BRIA_MAX_CHUNK_SECONDS` into consecutive ≤5s chunks, runs
 *  `runInpaintPrediction` on each in turn, and stitches the results back into one file — the same
 *  region is erased across every chunk (a single rect, matching how the mask already applies
 *  uniformly across the whole clip regardless of length). Each chunk is extracted directly from the
 *  ORIGINAL source file (not by re-cutting the already-encoded master extraction) so a long clip
 *  doesn't pay for an extra generation-loss re-encode on top of the one every chunk already needs.
 *  Sequential, not parallel — simpler error handling and progress reporting, and Replicate's own
 *  per-account concurrent-prediction limits make parallel chunks a real way to start failing jobs
 *  outright rather than actually finishing faster.
 *
 *  `POST`'s own upfront `spend()` already charged for this clip's full duration, per output SECOND
 *  (see `REMOVE_OBJECT_CREDITS_PER_SECOND`'s own comment), before this ever runs — a longer clip
 *  genuinely costs more real Replicate compute, and the credit price reflects that rather than a flat
 *  rate regardless of length. */
async function runChunkedInpaintPrediction(
  bpProjectId: string,
  jobId: string,
  sourcePath: string,
  sourceIn: number,
  sourceOut: number,
  scratchPrefix: string,
  width: number,
  height: number,
  fps: number,
  rect: { x: number; y: number; width: number; height: number },
  token: string,
  signal: AbortSignal,
  onProgress: (fraction: number) => void
): Promise<Buffer> {
  const totalDuration = sourceOut - sourceIn;
  const numChunks = Math.max(1, Math.ceil(totalDuration / BRIA_MAX_CHUNK_SECONDS));
  const chunkResultPaths: string[] = [];

  try {
    for (let i = 0; i < numChunks; i++) {
      if (signal.aborted) throw new ApiError(499, "Cancelled", "cancelled");
      const chunkStart = sourceIn + i * BRIA_MAX_CHUNK_SECONDS;
      const chunkEnd = Math.min(sourceOut, chunkStart + BRIA_MAX_CHUNK_SECONDS);
      const chunkVideoPath = `${scratchPrefix}-chunk${i}-src.mp4`;
      const chunkMaskPath = `${scratchPrefix}-chunk${i}-mask.mp4`;
      const chunkResultPath = `${scratchPrefix}-chunk${i}-result.mp4`;

      const extractArgs = buildExtractClipArgs(sourcePath, chunkVideoPath, chunkStart, chunkEnd);
      await new Promise<void>((resolve, reject) => {
        execFile(ffmpegBinary(), extractArgs, { timeout: 60_000 }, (err) =>
          err ? reject(new ApiError(500, `Could not extract chunk ${i + 1}/${numChunks}`, "chunk-extract-failed")) : resolve()
        );
      });

      const maskOk = await generateMaskVideo(chunkMaskPath, width, height, fps, chunkEnd - chunkStart, rect);
      if (!maskOk) throw new ApiError(500, `Could not generate chunk ${i + 1}/${numChunks}'s mask`, "mask-failed");

      const chunkBuffer = await runInpaintPrediction(
        bpProjectId,
        `${jobId}-chunk${i}`,
        chunkVideoPath,
        chunkMaskPath,
        token,
        signal,
        (fraction) => onProgress((i + fraction) / numChunks)
      );
      await fs.promises.writeFile(chunkResultPath, chunkBuffer);
      chunkResultPaths.push(chunkResultPath);

      // Each chunk's own source/mask scratch files are done being useful the moment its own
      // prediction finishes — cleaned up here rather than waiting for the whole job's own `finally`,
      // so a long clip's chunking doesn't accumulate every intermediate file at once on disk.
      fs.rm(chunkVideoPath, { force: true }, () => {});
      fs.rm(chunkMaskPath, { force: true }, () => {});
    }

    if (chunkResultPaths.length === 1) {
      return fs.promises.readFile(chunkResultPaths[0]);
    }

    // Concat demuxer (`-f concat`) needs a list file, not inline args — re-encoding (not `-c copy`)
    // trades a little time for robustness: each chunk came back from the SAME model/settings so
    // their streams SHOULD already match closely enough for a stream copy, but a subtle mismatch
    // (Bria adjusting encoder settings per-request, a dropped frame at a chunk boundary) is exactly
    // the kind of thing that makes `-c copy` concat fail outright, whereas re-encoding tolerates it.
    const concatListPath = `${scratchPrefix}-concat.txt`;
    const concatOutputPath = `${scratchPrefix}-concat-result.mp4`;
    fs.writeFileSync(concatListPath, chunkResultPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
    await new Promise<void>((resolve, reject) => {
      execFile(
        ffmpegBinary(),
        ["-y", "-f", "concat", "-safe", "0", "-i", concatListPath, "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart", concatOutputPath],
        { timeout: 120_000 },
        (err) => (err ? reject(new ApiError(500, "Could not stitch the processed chunks together", "concat-failed")) : resolve())
      );
    });
    const result = await fs.promises.readFile(concatOutputPath);
    fs.rm(concatListPath, { force: true }, () => {});
    fs.rm(concatOutputPath, { force: true }, () => {});
    return result;
  } finally {
    for (const p of chunkResultPaths) fs.rm(p, { force: true }, () => {});
  }
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
  const downloadRes = await fetch(outputUrl, { headers: { "User-Agent": "VCut/1.0 (+https://github.com/veasnawt/vcut)" }, signal });
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
    job.currentCancel = extractRun.cancel;
    await extractRun.done;
    job.currentProcess = null;
    job.currentCancel = null;

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
      const clipDuration = extractedProbe.duration || extractDuration;
      // Over `bria/video-erase-object`'s own 5-second cap — chunk it (extracting straight from the
      // real source, not re-cutting the already-encoded `extractedPath`, so a long clip doesn't pay
      // for an extra generation-loss re-encode on top of the one every chunk already needs) rather
      // than reusing the single master extraction this branch's short-clip path already has.
      resultBuffer =
        clipDuration > BRIA_MAX_CHUNK_SECONDS
          ? await runChunkedInpaintPrediction(
              bpProjectId,
              job.id,
              sourcePath,
              found.clip.sourceIn,
              found.clip.sourceOut,
              scratchPrefix,
              extractedProbe.width,
              extractedProbe.height,
              extractedProbe.fps ?? 30,
              rect,
              token!,
              job.abortController.signal,
              (fraction) => setStageProgress(job, "predicting", fraction)
            )
          : await runInpaintPrediction(bpProjectId, job.id, extractedPath, maskPath, token!, job.abortController.signal, (fraction) =>
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
      // Used to hardcode `false` back when the extracted source clip always had its audio dropped
      // (`-an`, see `buildExtractClipArgs`'s own comment) for ProPainter, a video-only model with no
      // audio concept — now that extraction keeps audio and `bria/video-erase-object` has a real
      // `preserve_audio` option, the result can genuinely have a soundtrack, so this reflects
      // whatever the finished file actually has instead of assuming.
      hasAudio: resultProbe.hasAudio,
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
    if (job.status === "failed") {
      // Same reasoning as `captions/route.ts`'s identical branch — confirmed necessary the hard way:
      // a real OpenAI "no credits remaining, add a payment method at platform.openai.com/..." error
      // reached an end user's dialog verbatim through captions' own equivalent unsanitized catch,
      // which is exactly the shape a raw Replicate/fal SDK error (their own billing/quota failures
      // included) could leak through here too. `ApiError`s this route's OWN code throws ("That clip
      // no longer exists", "Set your Replicate API key first", ...) are deliberately user-facing and
      // stay verbatim; anything else in hosted mode is an unvetted raw exception, sanitized instead.
      if (VCUT_HOSTED && !(err instanceof ApiError)) {
        console.error("[vcut] remove-object: job failed:", err);
        job.error = "Remove Object is temporarily unavailable — please try again later.";
      } else {
        job.error = err instanceof Error ? err.message : String(err);
      }
      if (VCUT_HOSTED && job.ownerId) void refundCredits(job.ownerId, job.spentAmount);
    }
  } finally {
    job.currentProcess = null;
    job.currentCancel = null;
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
export const POST = hostedCreditGatedRoute("remove-object", REMOVE_OBJECT_FLAT_COST, async (req, user, spend) => {
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

  // See `REMOVE_OBJECT_CREDITS_PER_SECOND`'s own comment: only the "replicate" provider is billed by
  // output-second, so only it prices per-second here — the clip's own requested duration IS the real
  // output duration, since each individual chunk this ends up split into (`runChunkedInpaintPrediction`)
  // is always ≤5s and so never actually needs `auto_trim` to shorten anything.
  const clipSeconds = found.clip.sourceOut - found.clip.sourceIn;
  const cost =
    keyStatus.activeProvider === "replicate"
      ? Math.max(REMOVE_OBJECT_CREDITS_PER_SECOND, Math.ceil(clipSeconds) * REMOVE_OBJECT_CREDITS_PER_SECOND)
      : REMOVE_OBJECT_FLAT_COST;

  // Every upfront check above has passed — see `captions/route.ts`'s identical comment for why this
  // is the right moment to actually spend, not automatically before the handler even started.
  await spend(cost);

  const id = crypto.randomUUID();
  const job = {
    id,
    status: "running" as JobStatus,
    stage: "extracting" as Stage,
    progress: 0,
    currentProcess: null,
    currentCancel: null,
    abortController: new AbortController(),
    spentAmount: cost,
    ...(user ? { ownerId: user.id } : null),
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
export const GET = hostedSessionRoute(async (req, user) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new ApiError(400, "Missing jobId", "missing-job-id");
  const job = jobs.get(jobId);
  if (!job) throw new ApiError(404, "That job is no longer running", "job-missing");
  assertJobOwnership(job, user?.id ?? null);

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
export const DELETE = hostedSessionRoute(async (req, user) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new ApiError(400, "Missing jobId", "missing-job-id");
  const job = jobs.get(jobId);
  if (!job) throw new ApiError(404, "That job is no longer running", "job-missing");
  assertJobOwnership(job, user?.id ?? null);

  if (job.status === "running") {
    job.currentCancel?.();
    job.abortController.abort();
  }
  return Response.json({ ok: true });
});

/** Reports whether "Remove Object" is usable at all right now — FFmpeg present AND the active
 *  provider has a key saved — so the Inspector section can explain what's missing instead of offering
 *  a dead button. */
export const HEAD = hostedSessionRoute(async () => {
  const keyStatus = getInpaintKeyStatus();
  const available = ffmpegAvailable().available && keyStatus.configured[keyStatus.activeProvider];
  return new Response(null, { status: available ? 204 : 503 });
});
