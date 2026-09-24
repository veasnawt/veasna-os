import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { createVad } from "@fluidinference/fluidvad";
import Replicate from "replicate";
import { attachWordsToSegments, chunkSegment, computePauseThreshold, repairGapsWithRealSilence } from "@veasnawt/vcut/src/captions/chunking";
import type { CaptionSegment } from "@veasnawt/vcut/src/captions/chunking";
import { ffmpegBinary, probeMedia } from "../../_lib/ffmpeg";
import { getKiriToken, getReplicateToken as getReplicateTokenForGeneration } from "../../_lib/inpaintEnvFile";
import { refundCredits } from "../../_lib/credits";
import { corsPreflight, hostedCreditGatedRouteCors, hostedSessionRouteCors, publicSessionRouteCors } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";
import type { CaptionRange } from "../route";

/** See `captions/route.ts`'s own doc comment for the full "why two routes" story — this one is the
 *  half that actually needs the secret transcription key, so it's CORS-enabled and reachable
 *  cross-origin (desktop calls it on the live vcut.io deployment after `captions/route.ts` finished
 *  extracting the audio locally). Everything below is otherwise IDENTICAL logic to the old single-route
 *  version's own VAD/transcription/chunking pipeline — moved, not rewritten, specifically to avoid
 *  disturbing any of the real production bugs it already fixed (see each function's own doc comment
 *  for that history). `getReplicateTokenForGeneration`/`getKiriToken`, not `_lib/inpaintEnvFile.ts`'s
 *  per-tenant-dangerous `getReplicateToken` the old route used — this route ONLY ever runs in hosted
 *  mode now (a `!VCUT_HOSTED` caller has no reason to reach a `vcut.io`-only URL), so it uses the same
 *  server-owned-token accessor `ai-image/route.ts`/`ai-video/route.ts` already do, not the local
 *  per-install key file (`inpaintEnvFile.ts`'s own doc comment on why that shape is actively dangerous
 *  in shared/hosted mode is exactly why this route never reads from it). */

const CAPTIONS_CREDITS_PER_MINUTE = 4;

/** Checked against `Content-Length` before the request body is parsed at all — same up-front-check
 *  shape `_lib/importMedia.ts`'s own `downloadMediaUrl` already uses (200MB there too), for the
 *  identical "don't let an unbounded request buffer unbounded memory" reason; not airtight (a client
 *  that omits or lies about `Content-Length` slips past this one check, same acknowledged limitation
 *  `downloadMediaUrl`'s own doc comment already accepts), but real and free. Generous on purpose:
 *  `audioBase64` is real project audio, legitimately anywhere from seconds to hours long, and MP3 at
 *  ordinary bitrates runs well under 1MB/minute — this comfortably covers a very long project while
 *  still bounding the worst case. */
const MAX_TRANSCRIBE_BODY_BYTES = 200 * 1024 * 1024;

type Stage = "transcribing" | "building-captions";
type JobStatus = "running" | "done" | "failed" | "cancelled";

interface CaptionsJob {
  id: string;
  status: JobStatus;
  stage: Stage;
  progress: number;
  captions?: CaptionSegment[];
  error?: string;
  ownerId?: string;
  spentAmount: number;
  abortController: AbortController;
  changed: Promise<void>;
  notify: () => void;
}

const jobs = new Map<string, CaptionsJob>();

function assertJobOwnership(job: CaptionsJob, userId: string | null): void {
  if (job.ownerId !== userId) throw new ApiError(404, "That job is no longer running", "job-missing");
}

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
  transcribing: [0, 0.85],
  "building-captions": [0.85, 1],
};

function setStageProgress(job: CaptionsJob, stage: Stage, fraction: number) {
  const [start, end] = STAGE_RANGES[stage];
  job.stage = stage;
  job.progress = start + (end - start) * Math.min(1, Math.max(0, fraction));
  job.notify();
}

/** Identical shape to the old single-route version's own `WhisperOutput` — see that file's git history
 *  for the full confirmation story (kept here verbatim, not re-derived). */
interface WhisperOutput {
  segments?: { start: number; end: number; text: string; words?: { word: string; start?: number; end?: number }[] }[];
  detected_language?: string;
}

const KIRI_API_BASE = "https://api.kiritts.com/v1";
const KIRI_POLL_INTERVAL_MS = 5000;

async function transcribeWithKiri(
  job: CaptionsJob,
  audioPath: string,
  token: string,
  onProgress: (fraction: number) => void
): Promise<WhisperOutput> {
  const form = new FormData();
  form.append("file", new Blob([await fs.promises.readFile(audioPath)], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", "kiristt");
  form.append("language", "km-KH");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities", "word,segment");

  const startRes = await fetch(`${KIRI_API_BASE}/audio/transcriptions/jobs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: job.abortController.signal,
  });
  if (!startRes.ok) {
    const body = (await startRes.json().catch(() => null)) as { error?: { message?: string }; detail?: string } | null;
    throw new ApiError(502, body?.error?.message ?? body?.detail ?? "Kiri could not start the transcription job", "kiri-start-failed");
  }
  const started = (await startRes.json()) as { id?: string };
  const jobId = started.id;
  if (!jobId) throw new ApiError(502, "Kiri did not return a job id", "kiri-no-job-id");
  onProgress(0.1);

  for (;;) {
    if (job.abortController.signal.aborted) throw new ApiError(499, "Cancelled", "cancelled");
    const statusRes = await fetch(`${KIRI_API_BASE}/audio/transcriptions/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: job.abortController.signal,
    });
    if (!statusRes.ok) throw new ApiError(502, "Lost contact with Kiri's transcription job", "kiri-status-failed");
    const statusBody = (await statusRes.json()) as { status?: string; error?: string };
    if (statusBody.status === "completed") {
      onProgress(0.9);
      break;
    }
    if (statusBody.status === "failed") {
      throw new ApiError(502, statusBody.error ?? "Kiri's transcription job failed", "kiri-job-failed");
    }
    onProgress(0.5);
    await new Promise((resolve) => setTimeout(resolve, KIRI_POLL_INTERVAL_MS));
  }

  const contentUrl = new URL(`${KIRI_API_BASE}/audio/transcriptions/jobs/${jobId}/content`);
  contentUrl.searchParams.set("response_format", "verbose_json");
  contentUrl.searchParams.append("timestamp_granularities", "word");
  contentUrl.searchParams.append("timestamp_granularities", "segment");
  const contentRes = await fetch(contentUrl, {
    headers: { Authorization: `Bearer ${token}` },
    signal: job.abortController.signal,
  });
  if (!contentRes.ok) throw new ApiError(502, "Could not download Kiri's finished transcript", "kiri-content-failed");
  const raw = (await contentRes.json()) as {
    segments?: { start: number; end: number; text: string }[];
    words?: { word: string; start: number; end: number }[];
  };
  const data = { segments: attachWordsToSegments(raw.segments ?? [], raw.words ?? []) };
  onProgress(1);
  return { segments: data.segments, detected_language: "km" };
}

const MIN_REAL_SILENCE_SECONDS = 0.25;

let vadPromise: ReturnType<typeof createVad> | null = null;
function getVad() {
  if (!vadPromise) vadPromise = createVad({ threshold: 0.5, minSilenceDuration: MIN_REAL_SILENCE_SECONDS });
  return vadPromise;
}

async function decodeToVadSamples(audioPath: string): Promise<Float32Array> {
  const pcm = await new Promise<Buffer>((resolve, reject) => {
    execFile(
      ffmpegBinary(),
      ["-i", audioPath, "-f", "f32le", "-ar", "16000", "-ac", "1", "-"],
      { timeout: 60_000, maxBuffer: 1024 * 1024 * 256, encoding: "buffer" },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    );
  });
  const floatCount = Math.floor(pcm.length / 4);
  const samples = new Float32Array(floatCount);
  for (let i = 0; i < floatCount; i++) samples[i] = pcm.readFloatLE(i * 4);
  return samples;
}

async function detectSilences(audioPath: string): Promise<{ start: number; end: number }[]> {
  const samples = await decodeToVadSamples(audioPath);
  const vad = await getVad();
  const speechSegments = vad.segment(samples);
  const silences: { start: number; end: number }[] = [];
  for (let i = 1; i < speechSegments.length; i++) {
    const gapStart = speechSegments[i - 1].endTime;
    const gapEnd = speechSegments[i].startTime;
    if (gapEnd - gapStart >= MIN_REAL_SILENCE_SECONDS) silences.push({ start: gapStart, end: gapEnd });
  }
  return silences;
}

async function runTranscribeJob(
  job: CaptionsJob,
  audioPath: string,
  ranges: CaptionRange[],
  durations: number[],
  language: string,
  wordHighlight: boolean
) {
  try {
    const realSilences = await detectSilences(audioPath);

    const concatOffsets: number[] = [];
    {
      let acc = 0;
      for (const d of durations) {
        concatOffsets.push(acc);
        acc += d;
      }
    }
    function mapToRealTime(t: number): number {
      for (let i = 0; i < ranges.length; i++) {
        const segStart = concatOffsets[i];
        const segEnd = segStart + durations[i];
        if (t < segEnd || i === ranges.length - 1) {
          return ranges[i].start + Math.max(0, t - segStart);
        }
      }
      return ranges[ranges.length - 1]?.start ?? t;
    }

    setStageProgress(job, "transcribing", 0);
    const kiriToken = language === "km" ? getKiriToken() : null;
    let data: WhisperOutput;
    if (kiriToken) {
      data = await transcribeWithKiri(job, audioPath, kiriToken, (fraction) => setStageProgress(job, "transcribing", fraction));
    } else {
      const token = getReplicateTokenForGeneration();
      if (!token) throw new ApiError(500, "Auto Captions isn't configured on this server", "captions-not-configured");

      const replicate = new Replicate({ auth: token });
      const model = await replicate.models.get("victor-upmeet", "whisperx");
      const version = model.latest_version?.id;
      if (!version) throw new ApiError(502, "Replicate's Whisper model has no runnable version", "replicate-model-unavailable");

      const audio_file = new File([await fs.promises.readFile(audioPath)], "audio.mp3", { type: "audio/mpeg" });
      const input: Record<string, unknown> = { audio_file, align_output: true };
      if (language !== "auto") {
        input.language = language;
      } else {
        input.language_detection_min_prob = 0.6;
      }
      const output = await replicate.run(
        `victor-upmeet/whisperx:${version}`,
        { input, signal: job.abortController.signal },
        (prediction) => {
          setStageProgress(job, "transcribing", prediction.status === "succeeded" ? 1 : prediction.status === "processing" ? 0.6 : 0.1);
        }
      );
      data = output as WhisperOutput;
    }

    setStageProgress(job, "building-captions", 0);
    const pauseThreshold = computePauseThreshold(data.segments ?? []);
    const rawCaptions = (data.segments ?? []).flatMap((s) => chunkSegment(s, wordHighlight, pauseThreshold));
    repairGapsWithRealSilence(rawCaptions, realSilences);
    const captions: CaptionSegment[] = rawCaptions
      .map((c) => ({ content: c.content, start: mapToRealTime(c.start), end: mapToRealTime(c.end), ...(c.words ? { words: c.words } : null) }))
      .filter((c) => c.content.length > 0 && c.end > c.start);

    job.captions = captions;
    job.status = "done";
    job.progress = 1;
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? (err as { code: string }).code : undefined;
    const isAbort = err instanceof Error && err.name === "AbortError";
    job.status = code === "cancelled" || isAbort ? "cancelled" : "failed";
    if (job.status === "failed") {
      if (!(err instanceof ApiError)) {
        console.error("[vcut] captions/transcribe: job failed:", err);
        job.error = "Auto Captions is temporarily unavailable — please try again later.";
      } else {
        job.error = err.message;
      }
      if (job.ownerId) void refundCredits(job.ownerId, job.spentAmount);
    }
  } finally {
    job.notify();
    fs.rm(audioPath, { force: true }, () => {});
    setTimeout(() => jobs.delete(job.id), 60_000).unref?.();
  }
}

/** `POST /api/vcut/captions/transcribe` `{audioBase64, ranges, durations, language, wordHighlight}` —
 *  `audioBase64`/`ranges`/`durations` are exactly `captions/route.ts`'s own POST response, passed
 *  straight through. CORS-enabled (`hostedCreditGatedRouteCors`, always requires a session).
 *
 *  Billed off the REAL duration of `audioBase64` itself (`probeMedia`), not off `ranges`/`durations` —
 *  this route is reachable cross-origin with nothing but the caller's own bearer token, so nothing
 *  ties a request to `captions/route.ts`'s own local extraction step actually having produced these
 *  numbers honestly. `audioBase64` IS exactly the concatenation of every range's extracted audio (see
 *  `captions/route.ts`'s own POST, `audioBase64 = fs.readFileSync(audioPath)...`), so its own real
 *  duration is both the correct billing basis and exactly what Kiri/Replicate actually transcribes —
 *  a client-supplied `ranges`/`durations` sum could be forged shorter than the audio actually sent
 *  (or longer than what's needed to bump the minimum charge, though that costs the user, not VCut,
 *  and was never the risk). `ranges`/`durations` are still passed through to `runTranscribeJob`
 *  unchanged below — genuinely needed there to map transcribed segments back onto timeline
 *  positions, just no longer trusted for money. */
export const POST = hostedCreditGatedRouteCors("captions", CAPTIONS_CREDITS_PER_MINUTE, async (req, user, spend) => {
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_TRANSCRIBE_BODY_BYTES) {
    throw new ApiError(413, "That audio is too large for Auto Captions", "transcribe-body-too-large");
  }

  const body = (await req.json().catch(() => null)) as {
    audioBase64?: string;
    ranges?: CaptionRange[];
    durations?: number[];
    language?: string;
    wordHighlight?: boolean;
  } | null;
  const audioBase64 = body?.audioBase64;
  const ranges = body?.ranges;
  const durations = body?.durations;
  if (!audioBase64 || !Array.isArray(ranges) || ranges.length === 0 || !Array.isArray(durations) || durations.length !== ranges.length) {
    throw new ApiError(400, "Missing or malformed audio", "missing-audio");
  }
  const language = typeof body?.language === "string" && body.language.trim() ? body.language.trim() : "auto";
  const wordHighlight = body?.wordHighlight === true;

  if (!getKiriToken() && !getReplicateTokenForGeneration()) throw new ApiError(500, "Auto Captions isn't configured on this server", "captions-not-configured");

  const id = crypto.randomUUID();
  const audioPath = path.join(os.tmpdir(), `vcut-captions-${id}.mp3`);
  await fs.promises.writeFile(audioPath, Buffer.from(audioBase64, "base64"));

  // Validated (and billed) before `spend()` — an unreadable/empty upload is ordinary upfront
  // validation, never charged for, same shape `inpaint/predict/route.ts`'s own probe-then-spend now
  // follows for the identical reason.
  const probe = await probeMedia(audioPath).catch((err) => {
    fs.rm(audioPath, { force: true }, () => {});
    throw err;
  });
  if (probe.duration <= 0) {
    fs.rm(audioPath, { force: true }, () => {});
    throw new ApiError(400, "That audio couldn't be read", "invalid-audio");
  }
  const cost = Math.max(CAPTIONS_CREDITS_PER_MINUTE, Math.ceil(probe.duration / 60) * CAPTIONS_CREDITS_PER_MINUTE);
  await spend(cost);

  const job = {
    id,
    status: "running" as JobStatus,
    stage: "transcribing" as Stage,
    progress: 0,
    spentAmount: cost,
    abortController: new AbortController(),
    ownerId: user.id,
  } as CaptionsJob;
  const notifier = makeNotifier(job);
  job.changed = notifier.changed;
  job.notify = notifier.notify;
  jobs.set(id, job);

  void runTranscribeJob(job, audioPath, ranges, durations, language, wordHighlight).catch(() => {
    // `runTranscribeJob` already handles its own errors internally — this only guarantees an unexpected
    // throw inside it can never become an unhandled rejection.
  });

  return Response.json({ jobId: id });
});

export const GET = hostedSessionRouteCors(async (req, user) => {
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
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
});

export const DELETE = hostedSessionRouteCors(async (req, user) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new ApiError(400, "Missing jobId", "missing-job-id");
  const job = jobs.get(jobId);
  if (!job) throw new ApiError(404, "That job is no longer running", "job-missing");
  assertJobOwnership(job, user?.id ?? null);

  if (job.status === "running") job.abortController.abort();
  return Response.json({ ok: true });
});

/** Reports whether the REMOTE half (secret transcription key) is configured — `client.ts`'s
 *  `captionsAvailable()` combines this with `captions/route.ts`'s own local FFmpeg check. */
export const HEAD = publicSessionRouteCors(async () => {
  return new Response(null, { status: getKiriToken() || getReplicateTokenForGeneration() ? 204 : 503 });
});

export const OPTIONS = corsPreflight;
