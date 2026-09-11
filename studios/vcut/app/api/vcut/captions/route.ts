import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import Replicate from "replicate";
import { buildAudioOnlyExportPlan } from "@veasnawt/vcut/src/export/buildAudioOnlyExportPlan";
import { trimProjectToRange } from "@veasnawt/vcut/src/export/trimForExport";
import { clipDuration, findAsset, findClip, sequenceDuration } from "@veasnawt/vcut/src/project/createProject";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import { segmentLine } from "@veasnawt/vcut/src/timeline/textAnimation";
import { ffmpegAvailable, ffmpegBinary, runFfmpeg } from "../_lib/ffmpeg";
import { VCUT_HOSTED } from "../_lib/auth";
import { getInpaintKeyStatus, getKiriToken, getReplicateToken } from "../_lib/inpaintEnvFile";
import { refundCredits } from "../_lib/credits";
import { hostedCreditGatedRoute, hostedSessionRoute } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs, resolveWithin } from "../_lib/paths";

/** Credits per minute of audio transcribed (rounded up) — a flat per-job rate here would have no
 *  ceiling on real cost, since this can transcribe an ENTIRE sequence (or a single clip) of whatever
 *  length a project happens to have: confirmed a genuine gap, not hypothetical, the same audit that
 *  found `inpaint/route.ts`'s own flat-rate-vs-$0.05/second problem for Remove Object. Replicate's
 *  `victor-upmeet/whisperx` (see `runCaptionsJob`'s own comment on why this specific model) bills by
 *  GPU-second, not a flat per-minute rate, but lands in the same rough
 *  ballpark OpenAI's own Whisper API did (well under a cent per minute of audio for typical short-form
 *  content) — at 4 credits/minute (scaled up 4x from 1, alongside the 300→1200 allotment increase and
 *  Remove Object's own identical 4x scale-up — see `REMOVE_OBJECT_CREDITS_PER_SECOND`'s doc comment
 *  for why: keeping every feature's credit cost scaled by the same factor is what keeps "one credit"
 *  worth a consistent amount of real value across the whole shared pool, not just for Remove Object),
 *  a Pro account's entire 1200-credit/month allotment spent on nothing but transcription covers 300
 *  minutes (5 hours) — trivial against VCut Pro's $9.99/month, so unlike Remove Object this doesn't
 *  need a margin-driven multiplier of its own; the fix that mattered here was pricing by length AT
 *  ALL, closing the "transcribe one very long sequence, over and over, for a flat 2 credits every
 *  time" gap rather than needing a steeper rate. */
const CAPTIONS_CREDITS_PER_MINUTE = 4;

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
  /** Real per-word timing, CLIP-RELATIVE (seconds from this segment's own `start`, matching
   *  `Clip.wordTimings`'s exact convention) — present only when `chunkSegment` had genuine per-word
   *  timestamps to work with (Kiri's Khmer output; WhisperX-aligned languages), never for the
   *  ESTIMATED-fallback branch (its own timing is invented, not real, so it would be dishonest to hand
   *  it to the client as if it were — the client's own `wordBoundaries` already has an equivalent
   *  even-spread fallback for exactly this "no real timing" case, no need to fabricate one here too). */
  words?: { text: string; start: number; end: number }[];
}

interface CaptionsJob {
  id: string;
  status: JobStatus;
  stage: Stage;
  progress: number;
  captions?: CaptionSegment[];
  error?: string;
  /** The hosted-mode session user who started this job, for `GET`/`DELETE`'s own ownership check —
   *  `undefined` in local/desktop mode, where there is no session to compare against (and no other
   *  tenant who could otherwise guess a `jobId` to poll/cancel). */
  ownerId?: string;
  /** What `spend()` actually charged for THIS job — priced per minute of audio (see
   *  `CAPTIONS_CREDITS_PER_MINUTE`'s own comment), not a flat rate. A failure refunds exactly this. */
  spentAmount: number;
  /** The extraction step's own ffmpeg child, killable on cancel while it's the active stage — same
   *  role as `InpaintJob.currentProcess`. */
  currentProcess: import("child_process").ChildProcess | null;
  /** `runFfmpeg`'s own `cancel()` for whichever run `currentProcess` currently points at — same role
   *  as `InpaintJob.currentCancel`; see that field's own doc comment for why `DELETE` must go through
   *  this instead of killing `currentProcess` directly. */
  currentCancel: (() => void) | null;
  /** Covers the transcription fetch. Aborting this does NOT stop OpenAI from having already received
   *  the upload if the request was already in flight past the point of no return — same "no true
   *  remote-cancel" limitation `inpaint/route.ts`'s own `abortController` has for Replicate/fal. */
  abortController: AbortController;
  changed: Promise<void>;
  notify: () => void;
}

/** Same module-lifetime in-memory job map as `inpaint/route.ts`/`export/route.ts` — see their own
 *  comments on why that scope is right for a local, single-user editor. Not a shared import (each
 *  route keeps its own small copy of this notifier plumbing). */
const jobs = new Map<string, CaptionsJob>();

/** In hosted mode, refuses access to a job that isn't the caller's own — the ownership scoping
 *  `GET`/`DELETE` never needed before hosted mode existed (nobody outside localhost could reach these
 *  routes at all). A missing/mismatched owner reads identically to "job not found" (404, not 403) —
 *  distinguishing them would tell a prober which job ids are real. No-op locally (`userId` is `null`
 *  there, and every local job has no `ownerId` to compare against anyway). */
function assertJobOwnership(job: CaptionsJob, userId: string | null): void {
  if (VCUT_HOSTED && job.ownerId !== userId) throw new ApiError(404, "That job is no longer running", "job-missing");
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

/** `victor-upmeet/whisperx`'s own Replicate `Output` — confirmed directly against that model's
 *  backing repo (`victor-upmeet/whisperx-replicate`'s `predict.py`). `segments` is always
 *  `{start, end, text, ...}` per detected speech span, PLUS a `words` array (`{word, start, end}`,
 *  each timestamp omitted rather than `null` when that specific word couldn't be aligned) whenever
 *  `align_output` succeeds for the segment's language — which this route now always requests, and
 *  `chunkSegment` below now actually uses (see its own comment for why an earlier version of this
 *  route deliberately didn't). `detected_language` is WhisperX's own guess (always present, whether
 *  `language` was pinned by the caller or left to auto-detect) — kept here for completeness/debugging
 *  visibility but no longer consumed downstream: word-joining spacing is now read directly from the
 *  real source text per word (see `TimedWord.leadingJoiner`'s own doc comment), not guessed from an
 *  overall segment language. */
interface WhisperOutput {
  segments?: { start: number; end: number; text: string; words?: { word: string; start?: number; end?: number }[] }[];
  detected_language?: string;
}

/** Kiri TTS's own transcription API (https://www.kiritts.com/docs/api) — used INSTEAD of Replicate's
 *  WhisperX specifically for Khmer (`language === "km"`, gated on `getKiriToken()` being configured —
 *  see that function's own doc comment for why there's no per-user key involved at all). The whole
 *  reason this exists: WhisperX has no forced-alignment model for Khmer (see `chunkSegment`'s
 *  estimated-timing fallback above), so Khmer captions from that path never get
 *  real per-word timestamps, only an even-spread estimate. Kiri is built Khmer-first and genuinely
 *  returns real per-word timing for Khmer — confirmed against a real key and real Khmer speech (NOT
 *  Kiri's own TTS output — that was tried first and separately confirmed broken: a Khmer-text `/v1/
 *  audio/speech` call returns audio that isn't actually Khmer speech, plus mislabels its own
 *  `response_format` — WAV bytes came back even when `mp3` was requested — so it's useless as a
 *  transcription test input and irrelevant to this function either way).
 *
 *  Confirmed shapes below (previously guessed from docs prose, now verified live, 2026-09-11):
 *  - `POST .../jobs` (multipart) → `202` with `{id, status: "pending", ...}` — job id is `id`.
 *  - `GET .../jobs/{id}` → same shape, `status` cycles `pending` → `processing` → `completed` | `failed`
 *    (a failed job's own `error` is a plain STRING here, e.g. "Transcription failed. Please try
 *    again." — different shape from the nested `{error:{message,type}}` envelope other endpoints use
 *    for HTTP-level failures, confirmed separately against a 403 from `/v1/audio/speech`).
 *  - `GET .../jobs/{id}/content` → bare (no query params) returns only `{text}`, EVEN for a completed
 *    job — `response_format=verbose_json` must be passed again here as a query param to get the full
 *    `{task, language, duration, text, segments}` shape, and `timestamp_granularities` must ALSO be
 *    passed again as REPEATED query params (`...&timestamp_granularities=word&timestamp_granularities=
 *    segment`, not one comma-joined value) to get `words` included at all — neither carries over from
 *    what was requested at job creation. `language` comes back as a full name ("khmer"), not an ISO
 *    code — irrelevant here since this function only ever runs for Khmer, so `detected_language` below
 *    is simply hardcoded to `"km"` rather than trusted from the response. `segments` also carry a
 *    `speaker` field (e.g. "Speaker 1") `WhisperOutput` doesn't declare — harmless, the `as` cast below
 *    just ignores it, same as any other extra field.
 *
 *  Real output confirmed genuinely word-per-word for Khmer script (not character-per-character, unlike
 *  WhisperX's own zh/ja case) — but real spacing within a completed segment's own `text` turned out
 *  messier than "Khmer never has spaces, only between segments": a segment can mix in a bare
 *  Latin-script word (e.g. "reflection") WITH a real space around it, AND carry an internal
 *  clause-boundary space between two ordinary Khmer words, both confirmed live from this exact
 *  function's own output reaching production. Neither is predictable from script or language alone —
 *  `chunkSegment`'s real-word branch handles this correctly by finding each word's own position back
 *  in `segment.text` and reading the real separator directly (see `TimedWord.leadingJoiner`'s own doc
 *  comment for the two guessing approaches this replaced and why both were wrong). */
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
    // The nested `{error:{message}}` envelope, confirmed against a real 403 — see this function's own
    // doc comment. `.detail` kept as a harmless second fallback in case a given error path differs.
    const body = (await startRes.json().catch(() => null)) as { error?: { message?: string }; detail?: string } | null;
    throw new ApiError(502, body?.error?.message ?? body?.detail ?? "Kiri could not start the transcription job", "kiri-start-failed");
  }
  const started = (await startRes.json()) as { id?: string };
  const jobId = started.id;
  if (!jobId) throw new ApiError(502, "Kiri did not return a job id", "kiri-no-job-id");
  console.log(`[vcut] transcribeWithKiri: started Kiri job ${jobId}`); // temporary diagnostic, see call site's own comment
  onProgress(0.1);

  // Polled, not SSE/webhook — Kiri's own docs describe only a plain GET status endpoint for job mode.
  // Confirmed live: even a short (~10s) clip regularly takes several minutes to leave "processing", so
  // this polls slower than `watchCaptions`' own SSE cadence would suggest — no point hammering it.
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
  const data = (await contentRes.json()) as { segments?: WhisperOutput["segments"] };
  // Kiri-specific diagnostic — measures the gap BETWEEN Kiri's own ASR segments (as opposed to within
  // one segment's own `words`, which `runCaptionsJob`'s own permanent diagnostic already covers
  // provider-agnostically once `chunkSegment` has run for every segment). Segment boundaries are
  // Kiri's own call (VAD/sentence splitting), not this route's — a real pause landing exactly AT a
  // segment boundary rather than inside one flows straight through to the final captions with no
  // `pauseThreshold` involved at all (see `chunkSegment`'s own doc comment: it runs per segment via
  // `flatMap`, never merging across segment boundaries), so this has no adaptive-threshold logic of
  // its own to get wrong — kept simple, just real numbers off the raw response.
  {
    const segments = data.segments ?? [];
    let maxInterSegmentGap = 0;
    for (let i = 1; i < segments.length; i++) maxInterSegmentGap = Math.max(maxInterSegmentGap, segments[i].start - segments[i - 1].end);
    console.log(`[vcut] transcribeWithKiri: Kiri job ${jobId} done, ${segments.length} segment(s), max inter-segment gap=${maxInterSegmentGap.toFixed(3)}s`);
  }
  onProgress(1);
  return { segments: data.segments, detected_language: "km" };
}

/** A caption clip should read as one short line, not a whole paragraph — past either threshold, a
 *  segment gets split further (see `chunkSegment`). `*_SECONDS` catches the OTHER shape of "too long":
 *  a segment that's short in text but slow, drawled speech (rare, but a 40-char segment spanning 15s
 *  of silence-punctuated speech would otherwise sit on screen doing nothing for most of that time).
 *  The `WORD_HIGHLIGHT_*` pair is deliberately tighter (by WORD count, not characters — word length
 *  varies too much across scripts for a character budget to mean "about N words" consistently) —
 *  see `chunkSegment`'s own comment for why Word Highlight specifically benefits from shorter chunks
 *  even though every OTHER animation is fine with the longer, more reading-friendly default. */
const MAX_CAPTION_CHARS = 42;
const MAX_CAPTION_SECONDS = 5;
const WORD_HIGHLIGHT_MAX_WORDS = 4;
const WORD_HIGHLIGHT_MAX_SECONDS = 2.2;

/** A real per-word gap longer than the job's own `pauseThreshold` (see `computePauseThreshold` below)
 *  forces a chunk break, REGARDLESS of the char/word/second budgets above — a caption clip's own
 *  `[start, end]` otherwise spans straight through a genuine pause in the speech (a whole ASR segment
 *  CAN legitimately cover one: WhisperX/Kiri split by VAD/sentence, not by every brief silence), which
 *  reads as one caption sitting on screen doing nothing for the pause's own duration instead of the
 *  screen genuinely going blank between two separate thoughts — confirmed as a real, reported gap, not
 *  a hypothetical one. Only ever checked against REAL per-word timing (see
 *  `includeWordTimings`/`hasInternalPause`) — the estimated fallback's synthetic, evenly-spread word
 *  positions have no genuine silence to detect at all.
 *
 *  This used to be one hardcoded constant shared by every job ever run (0.5s, then lowered to 0.3s
 *  after a live report that captions still showed no gaps at all — a real captured Kiri sample's own
 *  MAX real inter-word gap across a whole 10s clip of continuous speech was only 0.34s, meaning normal
 *  conversational pacing regularly never crossed 0.5s in the first place). That fix was itself fragile
 *  in the same way the first constant was: "normal word-to-word gap" isn't one universal number — it
 *  varies by speaker, language, mic quality, and even provider timestamp quantization, so any single
 *  fixed cutoff will eventually be wrong again for the next recording (too high for a slow, deliberate
 *  speaker whose normal gaps regularly approach it; too low for a fast, dense speaker whose real pauses
 *  never get that large in absolute terms). `computePauseThreshold` replaces the fixed constant with a
 *  threshold computed FROM each job's own real gap distribution — adaptive per recording instead of
 *  requiring a human to keep re-guessing a shared global number as new samples come in. */
const PAUSE_GAP_FLOOR_SECONDS = 0.2;

/** How many "typical gap units" above the job's own median counts as a genuine outlier — see
 *  `computePauseThreshold`'s own doc comment. 3 is a standard robust-statistics convention (a "modified
 *  z-score" of 3 using MAD in place of standard deviation is the widely-used default for flagging
 *  outliers, e.g. Iglewicz & Hoaglin's rule of thumb) — comfortably past ordinary variance in
 *  conversational pacing without requiring a dramatic, multi-second silence to fire. */
const PAUSE_OUTLIER_MULTIPLIER = 3;

/** Floor under the job's own median-absolute-deviation spread — a recording with extremely uniform
 *  inter-word gaps (near-zero variance, e.g. a very clean, evenly-paced reading) would otherwise collapse
 *  `PAUSE_OUTLIER_MULTIPLIER * mad` to almost nothing, making the adaptive threshold MORE sensitive than
 *  intended instead of less. Keeps the multiplier meaningful even when a recording's own gaps genuinely
 *  don't vary much. */
const MIN_GAP_SPREAD_SECONDS = 0.05;

/** Below this many real inter-word gap samples, a per-job median/MAD is too noisy to trust (a "typical
 *  gap" computed from 2-3 data points isn't a real distribution) — falls back to the plain floor instead
 *  of possibly building an adaptive threshold that's actively worse than a fixed one. A short clip or a
 *  segment-sparse transcript can easily land here; the floor alone is still a reasonable, conservative
 *  default in that case (see `PAUSE_GAP_FLOOR_SECONDS`'s own value). */
const MIN_GAP_SAMPLES_FOR_ADAPTIVE = 12;

/** Computes ONE pause threshold for an entire transcription job from every REAL inter-word gap that
 *  job's provider reported (across ALL segments, not per-segment — a single ASR segment often has too
 *  few words for a reliable median/MAD on its own, while pacing is generally consistent across one
 *  speaker/recording, so pooling the whole job's gaps gives a much more stable per-recording baseline
 *  while still adapting per speaker/recording instead of using one number for every job ever run).
 *
 *  Uses the MEDIAN (not mean) as the "typical gap" baseline and MAD (median absolute deviation, not
 *  standard deviation) as the spread — both are robust to the outliers this function exists to detect
 *  in the first place: a handful of genuine multi-second pauses in an otherwise fast-paced recording
 *  would drag a MEAN/stddev-based baseline upward, making the resulting threshold LESS sensitive to
 *  exactly the pauses it's supposed to catch. Final threshold is `max(floor, median + K * spread)` —
 *  never below the floor even for a recording with almost no real gap variance at all, always adaptive
 *  above it for a recording whose own pacing runs unusually slow (median well above the floor) or
 *  unusually punctuated (spread genuinely wide). */
function computePauseThreshold(segments: { words?: { word: string; start?: number; end?: number }[] }[]): number {
  const gaps: number[] = [];
  for (const segment of segments) {
    const words = segment.words ?? [];
    let previousEnd: number | undefined;
    for (const w of words) {
      if (typeof w.start !== "number" || typeof w.end !== "number") continue;
      if (previousEnd !== undefined) {
        const gap = w.start - previousEnd;
        if (gap >= 0) gaps.push(gap);
      }
      previousEnd = w.end;
    }
  }
  if (gaps.length < MIN_GAP_SAMPLES_FOR_ADAPTIVE) return PAUSE_GAP_FLOOR_SECONDS;

  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = sorted.map((g) => Math.abs(g - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)];
  const spread = Math.max(mad, MIN_GAP_SPREAD_SECONDS);
  return Math.max(PAUSE_GAP_FLOOR_SECONDS, median + PAUSE_OUTLIER_MULTIPLIER * spread);
}

/** Whether any two REAL, consecutive per-word timestamps in `words` are separated by more than
 *  `pauseThreshold` — used to veto `chunkSegment`'s "fits as one chunk" shortcut, which otherwise has no
 *  way to know a segment it would leave whole actually contains a pause worth splitting on (see
 *  `computePauseThreshold`'s own doc comment for where `pauseThreshold` itself comes from). Entries
 *  without a real `start`/`end` (alignment failed for that specific word) are simply skipped rather than
 *  treated as a gap — same "not every word aligns" tolerance `chunkSegment`'s own `rawWords` filter
 *  already has. */
function hasInternalPause(words: { word: string; start?: number; end?: number }[], pauseThreshold: number): boolean {
  let previousEnd: number | undefined;
  for (const w of words) {
    if (typeof w.start !== "number" || typeof w.end !== "number") continue;
    if (previousEnd !== undefined && w.start - previousEnd > pauseThreshold) return true;
    previousEnd = w.end;
  }
  return false;
}

interface TimedWord {
  text: string;
  start: number;
  end: number;
  /** Raw text that appeared between this word and the PREVIOUS one in the real source text — "" for
   *  a word that starts a chunk fresh, otherwise copied VERBATIM from the real source rather than
   *  guessed by any per-language or per-script rule. An earlier version of this tried exactly that (a
   *  per-language flag, then a per-adjacent-pair Unicode-script check) and both were proven wrong
   *  live: a real Kiri Khmer segment mixes in a bare Latin word ("reflection") WITH a real space
   *  around it, AND — the script check's own blind spot — a single Khmer segment can carry an
   *  internal clause-boundary space between two Khmer-script words that no per-word script rule can
   *  ever tell apart from a genuine no-space Khmer word boundary. The real fix is to stop guessing:
   *  this field is populated by literally reading the separator that was really there, per branch
   *  below — `chunkSegment`'s real-word branch finds each word's own position in `segment.text` and
   *  takes whatever's actually between them; its estimated-fallback branch already has this for free,
   *  since `segmentLine`'s non-word pieces (spaces, punctuation) ARE the real separators, just
   *  previously discarded by an `isWord`-only filter instead of kept. */
  leadingJoiner: string;
}

/** Locates each `rawWords` entry's own position in `text`, in order, and returns a `TimedWord[]` whose
 *  `leadingJoiner` is copied verbatim from whatever real text actually separated it from the PREVIOUS
 *  word — see `TimedWord.leadingJoiner`'s own doc comment for why this replaced a script-based guess.
 *  Search starts from just past the previous match each time (never re-scans from 0), so a word that
 *  happens to repeat earlier in the segment can't be mismatched to its own earlier occurrence. A word
 *  that can't be found from that point on (case mismatch, punctuation Kiri/WhisperX stripped
 *  differently than it appears in `text`, ...) falls back to a plain space — the common-case default —
 *  rather than dropping the word or throwing. */
function alignWordsToText(text: string, rawWords: { word: string; start: number; end: number }[]): TimedWord[] {
  const result: TimedWord[] = [];
  let cursor = 0;
  for (const w of rawWords) {
    const word = w.word.trim();
    if (!word) continue;
    const idx = text.indexOf(word, cursor);
    const leadingJoiner = result.length === 0 ? "" : idx === -1 ? " " : text.slice(cursor, idx);
    if (idx !== -1) cursor = idx + word.length;
    result.push({ text: word, start: w.start, end: w.end, leadingJoiner });
  }
  return result;
}

/** Groups already-timed words into chunks, cutting whenever the NEXT word would push the current
 *  chunk past `maxChars` (if given), `maxWords` (if given), or `maxSeconds` since the chunk's own
 *  first word — whichever limit is actually configured for this call. Each chunk's own `start`/`end`
 *  comes directly from its first/last word's real timestamp, never recomputed — this is the one place
 *  both `chunkSegment` branches below (real per-word timing and the estimated fallback) converge, so
 *  there's only one grouping/capping algorithm to keep correct. Each word's own `leadingJoiner` (see
 *  that field's own doc comment) is simply used as-is — EXCEPT for whichever word ends up first in a
 *  chunk after a `flush()`, which never gets a leading joiner charged against it (that word starts a
 *  fresh line; its `leadingJoiner` describes its relationship to the PREVIOUS chunk, not this one). */
function groupTimedWords(
  words: TimedWord[],
  limits: { maxChars?: number; maxWords?: number; maxSeconds: number },
  includeWordTimings: boolean,
  pauseThreshold: number
): CaptionSegment[] {
  const chunks: CaptionSegment[] = [];
  let current: TimedWord[] = [];
  let currentChars = 0;

  function flush() {
    if (current.length === 0) return;
    let content = current[0].text;
    for (let i = 1; i < current.length; i++) content += current[i].leadingJoiner + current[i].text;
    // Clip-relative (relative to THIS chunk's own start) even though `mapToRealTime` hasn't run yet —
    // safe because that mapping is a constant per-range OFFSET, so subtracting two not-yet-mapped
    // timestamps in the SAME range already equals subtracting the mapped ones would. Only emitted for
    // the real-word branch (`includeWordTimings`) — see `CaptionSegment.words`'s own doc comment for
    // why the estimated fallback's invented timing shouldn't be handed to the client as if real.
    const words = includeWordTimings
      ? current.map((w) => ({ text: w.text, start: w.start - current[0].start, end: w.end - current[0].start }))
      : undefined;
    chunks.push({ content, start: current[0].start, end: current[current.length - 1].end, ...(words ? { words } : null) });
    current = [];
    currentChars = 0;
  }

  for (const word of words) {
    if (current.length > 0) {
      const nextChars = currentChars + word.leadingJoiner.length + word.text.length;
      const overChars = limits.maxChars !== undefined && nextChars > limits.maxChars;
      const overWords = limits.maxWords !== undefined && current.length + 1 > limits.maxWords;
      const overSeconds = word.end - current[0].start > limits.maxSeconds;
      // Only against REAL timing (see `computePauseThreshold`'s own doc comment) — the estimated
      // fallback's synthetic word positions are contiguous by construction, so this would never fire for
      // them anyway, but gating it explicitly keeps the intent honest rather than relying on that
      // coincidence.
      const overGap = includeWordTimings && word.start - current[current.length - 1].end > pauseThreshold;
      if (overChars || overWords || overSeconds || overGap) flush();
    }
    current.push(word);
    currentChars = current.length === 1 ? word.text.length : currentChars + word.leadingJoiner.length + word.text.length;
  }
  flush();
  return chunks;
}

/** Splits ONE ASR segment into shorter, timed caption chunks whenever it runs past a comfortable
 *  length. `align_output: true` (see `runCaptionsJob`'s own comment) already gets WhisperX to segment
 *  by SENTENCE rather than by its own internal 30s decode window — a real fix for the common case on
 *  its own — but a single long sentence (or, for a language alignment isn't available for, a whole
 *  un-split ASR segment) can still run past a comfortable caption length, and even a short segment
 *  benefits from REAL per-word timing here when it's available: a fixed per-chunk time budget can't
 *  tell fast speech from slow, which is exactly the "sometimes fast, sometimes slow" sync complaint
 *  this fixes — confirmed real, not hypothetical, from actually comparing generated captions against
 *  the source audio.
 *
 *  Prefers `segment.words` (real per-word timestamps, present whenever alignment succeeded for this
 *  segment's language) over the ESTIMATED fallback below — an earlier version of this route
 *  deliberately ignored `words` entirely, worried a MISMATCH between WhisperX's own tokenization and
 *  `segmentLine`'s `Intl.Segmenter` one could misalign chunk boundaries. That risk only ever applied
 *  to trying to RECONCILE the two independently; using `segment.words` as the ONLY source of both
 *  TEXT and TIMING (never cross-referencing `segmentLine` for the same segment) sidesteps it
 *  entirely — there is no second tokenization for WhisperX's own to disagree with. `wordHighlight`
 *  picks which cap (`WORD_HIGHLIGHT_*` vs. the longer, reading-friendly default) chunking uses —
 *  passed through from the client's own chosen animation (see `runCaptionsJob`'s own parameter) —
 *  since a highlighted word tracking real speech pace is what actually benefits from short chunks;
 *  a plain caption line reads better a little longer.
 *
 *  Falls back to spreading `segment`'s own real `[start, end]` interval EVENLY across however many
 *  words `segmentLine` finds whenever `words` is absent or every entry in it failed to align (Khmer,
 *  Thai, and every other language `victor-upmeet/whisperx` has no alignment model for at all) — the
 *  same "even distribution" approximation `timeline/textAnimation.ts`'s `activeWordIndex` already uses
 *  for `wordHighlight` playback when it has nothing better to go on, so this isn't a new kind of
 *  imprecision the app doesn't already rely on elsewhere; shorter chunks (from `wordHighlight`'s own
 *  tighter cap) shrink that estimation error too, even without real timing to work from. */
function chunkSegment(
  segment: { start: number; end: number; text: string; words?: { word: string; start?: number; end?: number }[] },
  wordHighlight: boolean,
  pauseThreshold: number
): CaptionSegment[] {
  const text = segment.text.trim();
  if (!text) return [];
  const duration = segment.end - segment.start;
  const limits = wordHighlight
    ? { maxWords: WORD_HIGHLIGHT_MAX_WORDS, maxSeconds: WORD_HIGHLIGHT_MAX_SECONDS }
    : { maxChars: MAX_CAPTION_CHARS, maxSeconds: MAX_CAPTION_SECONDS };
  const fitsAsOneChunk =
    duration <= limits.maxSeconds &&
    (limits.maxChars === undefined || text.length <= limits.maxChars) &&
    !wordHighlight &&
    !hasInternalPause(segment.words ?? [], pauseThreshold);
  if (fitsAsOneChunk) return [{ content: text, start: segment.start, end: segment.end }];

  const rawWords = (segment.words ?? []).filter(
    (w): w is { word: string; start: number; end: number } => typeof w.start === "number" && typeof w.end === "number" && w.word.trim().length > 0
  );

  if (rawWords.length > 0) {
    return groupTimedWords(alignWordsToText(text, rawWords), limits, true, pauseThreshold);
  }

  // Estimated fallback — no real per-word timing to go on for this segment/language at all.
  // `segmentLine` returns EVERY piece of `text`, word and non-word alike, in order — non-word pieces
  // (spaces, punctuation) ARE the real separators, so they're accumulated into `pendingJoiner` and
  // attached to the NEXT word piece as its `leadingJoiner`, rather than discarded and reconstructed by
  // a guess (see `TimedWord.leadingJoiner`'s own doc comment for why a guess isn't good enough here).
  const pieces = segmentLine(text);
  const wordPieces: { text: string; leadingJoiner: string }[] = [];
  let pendingJoiner = "";
  for (const piece of pieces) {
    if (piece.isWord) {
      wordPieces.push({ text: piece.text, leadingJoiner: wordPieces.length === 0 ? "" : pendingJoiner });
      pendingJoiner = "";
    } else {
      pendingJoiner += piece.text;
    }
  }
  if (wordPieces.length === 0) return [{ content: text, start: segment.start, end: segment.end }];
  const secondsPerWord = duration / wordPieces.length;
  let index = 0;
  const estimatedWords: TimedWord[] = wordPieces.map((p) => {
    const start = segment.start + index * secondsPerWord;
    index += 1;
    return { text: p.text, leadingJoiner: p.leadingJoiner, start, end: segment.start + index * secondsPerWord };
  });
  return groupTimedWords(estimatedWords, limits, false, pauseThreshold);
}

/** One span of the timeline to transcribe — the whole sequence is a single `CaptionRange`, a per-clip
 *  or multi-clip-selection job is one range per selected clip (see `runCaptionsJob`'s own doc comment
 *  for how several of these get combined into one transcription pass). */
interface CaptionRange {
  start: number;
  end: number;
}

async function runCaptionsJob(
  job: CaptionsJob,
  bpProjectId: string,
  ranges: CaptionRange[],
  language: string,
  wordHighlight: boolean
) {
  const paths = ensureProjectDirs(bpProjectId);
  const audioPath = path.join(paths.scratchDir, `${job.id}-audio.mp3`);
  // One extracted file per range, concatenated into `audioPath` below when there's more than one —
  // tracked here (not just inside the `try`) so the `finally` block can always clean them up
  // regardless of which stage failed.
  const partPaths: string[] = [];
  const concatListPath = path.join(paths.scratchDir, `${job.id}-concat.txt`);

  try {
    const project = deserializeProject(fs.readFileSync(paths.projectFile, "utf8"));

    // --- extracting-audio ---
    job.stage = "extracting-audio";
    job.notify();

    // Each range is extracted through the EXACT SAME `trimProjectToRange` + `buildAudioOnlyExportPlan`
    // pass the original single-range job always used — a no-op trim for the whole-sequence case
    // (one range spanning the full project), and for a per-clip/multi-clip-selection job, each
    // range's own mix still correctly includes whatever ELSE is on the timeline during that clip's
    // own span (other tracks included), exactly matching the single-clip job's pre-existing behavior.
    // What's NEW here is stitching several of these together: for a multi-clip selection, only
    // extracting each SELECTED clip's own span and concatenating them — instead of transcribing the
    // one contiguous [earliest start, latest end) window — is what keeps a gap BETWEEN two selected
    // clips (whatever got trimmed away, or simply silence) from ever reaching the model at all, so
    // it can't waste a caption chunk on it or, worse, drift the rest of the transcript's timing.
    const durations: number[] = [];
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      const trimmed = trimProjectToRange(project, range.start, range.end);
      const partPath = ranges.length === 1 ? audioPath : path.join(paths.scratchDir, `${job.id}-audio-part${i}.mp3`);
      partPaths.push(partPath);
      const plan = buildAudioOnlyExportPlan(trimmed, {
        inputPathFor: (assetId) => {
          const asset = findAsset(trimmed, assetId);
          if (!asset) throw new ApiError(400, "A clip references media that is no longer in the project", "missing-asset");
          return resolveWithin(paths.mediaDir, asset.relPath);
        },
        outputPath: partPath,
      });
      durations.push(plan.duration);
      const extractRun = runFfmpeg(plan.args, plan.duration, (fraction) =>
        setStageProgress(job, "extracting-audio", (i + fraction) / ranges.length)
      );
      job.currentProcess = extractRun.process;
      job.currentCancel = extractRun.cancel;
      await extractRun.done;
      job.currentProcess = null;
      job.currentCancel = null;
      if (job.abortController.signal.aborted) throw new ApiError(499, "Cancelled", "cancelled");
    }

    // Every part shares the exact same fixed encoder settings (`buildAudioOnlyExportPlan`'s own mono/
    // 64k/libmp3lame output, regardless of source) — a plain stream-copy concat is safe and avoids a
    // second, pointless re-encode pass just to glue them together.
    if (ranges.length > 1) {
      fs.writeFileSync(concatListPath, partPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
      await new Promise<void>((resolve, reject) => {
        execFile(
          ffmpegBinary(),
          ["-y", "-f", "concat", "-safe", "0", "-i", concatListPath, "-c", "copy", audioPath],
          { timeout: 60_000 },
          (err) => (err ? reject(new ApiError(500, "Could not combine the selected clips' audio", "concat-failed")) : resolve())
        );
      });
      if (job.abortController.signal.aborted) throw new ApiError(499, "Cancelled", "cancelled");
    }

    // Where each range's own audio LANDS in the combined file — the ONE thing that makes it possible
    // to map a caption timestamp (relative to that combined file, which is all Whisper ever sees) back
    // to its correct absolute position on the real timeline once results come back below.
    const concatOffsets: number[] = [];
    {
      let acc = 0;
      for (const d of durations) {
        concatOffsets.push(acc);
        acc += d;
      }
    }
    /** Maps a timestamp relative to the combined extracted audio back to absolute sequence-timeline
     *  seconds — the multi-range generalization of the original single-range job's plain `rangeStart +`
     *  offset. Finds which range's own slice of the combined file `t` falls into, then re-anchors it
     *  at that range's own real `start`. Clamped into the LAST range for anything past the combined
     *  file's own nominal end (a caption whose Whisper-reported end lands a hair past the last part's
     *  measured duration — encoder rounding, not a real content gap) rather than ever falling through
     *  with no mapping at all. */
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

    // --- transcribing ---
    setStageProgress(job, "transcribing", 0);
    // Khmer routes to Kiri instead of Replicate's WhisperX whenever a server-owned Kiri token is
    // configured (see `getKiriToken`'s own doc comment — always server-owned, never per-user) — see
    // `transcribeWithKiri`'s own doc comment for why Khmer specifically benefits. Every other language,
    // and Khmer itself when no Kiri token is set (e.g. a local/desktop build, which never has one), keep
    // using the existing Replicate/WhisperX path below unchanged.
    const kiriToken = language === "km" ? getKiriToken() : null;
    // Temporary diagnostic — confirms in the Railway logs which provider a given job actually took,
    // since nothing else currently surfaces that distinction anywhere observable from outside this
    // function. Safe to remove once Kiri routing is confirmed working end-to-end in production.
    console.log(`[vcut] captions job ${job.id}: language=${language} provider=${kiriToken ? "kiri" : "replicate"}`);
    let data: WhisperOutput;
    if (kiriToken) {
      data = await transcribeWithKiri(job, audioPath, kiriToken, (fraction) => setStageProgress(job, "transcribing", fraction));
    } else {
      const token = getReplicateToken();
      if (!token) throw new ApiError(400, "Set your Replicate API key first", "no-api-key");

      const replicate = new Replicate({ auth: token });
      // `victor-upmeet/whisperx`, not the plain `openai/whisper` model this route started with —
      // switched after a real, reported bug: stock Whisper decodes in ~30s windows and only splits a
      // segment where ITS OWN timestamp-token prediction happens to land, which for a short clip with no
      // long pause can come back as ONE segment spanning the whole thing (confirmed live, worse for
      // Khmer specifically — a low-resource language where Whisper's segment-boundary predictions are
      // markedly less reliable). WhisperX runs its own VAD (voice-activity detection) pass first and
      // transcribes each detected speech span separately — genuinely helps for audio with real pauses in
      // it, but confirmed LIVE this is not sufficient on its own: continuous, pause-free speech (a common
      // case, not an edge case) still came back as one giant VAD-detected span, and so still one segment.
      // `align_output: true` below is what actually closes that gap — it makes WhisperX ALSO run a
      // forced-alignment pass that re-segments its own output by SENTENCE (not just by VAD-detected
      // pause), so a single long span of continuous speech still comes back as several natural,
      // sentence-sized segments. `chunkSegment` (above) is the backstop for whatever's still too long
      // after that — either a single long sentence, or a whole un-split ASR/VAD segment for a language
      // alignment doesn't cover (Khmer among them — now routed to Kiri above instead when a token is
      // configured; see that function's own comment for how this path still estimates timing when
      // there's no real per-word alignment to go on, for whichever language/case it still handles).
      // Same underlying large-v3 weights as before either way, but shorter, VAD-isolated chunks also cut
      // down on the long-context "drift"/repeat-loop failure mode Whisper is known for, which should
      // read as somewhat more accurate too.
      //
      // Resolved to the model's own `latest_version.id` rather than the bare "owner/name" shorthand —
      // same reasoning `inpaint/route.ts`'s own Replicate calls use: works regardless of whether a given
      // model happens to support the shorthand route, and pins this run to whichever version was
      // actually current when it started even if a newer one lands mid-request.
      const model = await replicate.models.get("victor-upmeet", "whisperx");
      const version = model.latest_version?.id;
      if (!version) throw new ApiError(502, "Replicate's Whisper model has no runnable version", "replicate-model-unavailable");

      const audio_file = new File([await fs.promises.readFile(audioPath)], "audio.mp3", { type: "audio/mpeg" });
      const input: Record<string, unknown> = { audio_file, align_output: true };
      // `language: null`/omitted means "detect it" to this model (unlike `openai/whisper`'s own
      // `"auto"` string) — see this model's own `predict.py`: `Optional[str] = Input(default=None)`.
      if (language !== "auto") {
        input.language = language;
      } else {
        // Left at its own default (`language_detection_min_prob: 0`), a bare `language: None` skips
        // this model's own recursive-sampling detection entirely and falls straight through to
        // faster-whisper's OWN per-batch auto-detect during transcription itself — confirmed, not
        // hypothetical, a real, documented WhisperX failure class (github.com/m-bain/whisperX#298,
        // "a phantom language can ruin the whole transcription"): a single VAD chunk mid-file
        // misdetected as a DIFFERENT language than the rest gets transcribed as if it genuinely were
        // that language (or dropped outright), which for a whole-SEQUENCE job — several concatenated
        // clips, exactly the kind of file most likely to contain a chunk that reads ambiguously
        // (background music, a quiet clip, a brief non-speech gap) — reads as "captions only cover the
        // first clip, then stop": once a later chunk gets misdetected, nothing after it decodes
        // sensibly. Setting a real probability threshold here activates the model's OWN more-robust
        // path instead: it samples SEVERAL segments spread across the whole file (`audio_duration`
        // permitting) and keeps the most confident result as ONE language for the entire transcription,
        // rather than trusting whatever a single chunk's own in-flight guess happens to be. A per-clip
        // job (always short, always one genuinely uniform source) never needed this — it's the
        // whole-sequence case specifically that benefits, but there's no reason to condition it on job
        // size when it's harmless and strictly more robust for a short file too (the recursive sampling
        // itself only kicks in past this model's own 30s floor either way — see `predict.py`).
        input.language_detection_min_prob = 0.6;
      }
      const output = await replicate.run(
        `victor-upmeet/whisperx:${version}`,
        { input, signal: job.abortController.signal },
        (prediction) => {
          // Same coarse status→fraction mapping `inpaint/route.ts`'s own Replicate call uses —
          // Replicate's own API reports a status enum here, not a fine-grained percentage.
          setStageProgress(job, "transcribing", prediction.status === "succeeded" ? 1 : prediction.status === "processing" ? 0.6 : 0.1);
        }
      );
      data = output as WhisperOutput;
    }

    // --- building-captions ---
    setStageProgress(job, "building-captions", 0);
    // Whisper's own segment timestamps (whichever provider runs the model) are relative to the
    // COMBINED extracted audio file — `mapToRealTime` is what converts them back to absolute
    // sequence-timeline seconds (a plain `ranges[0].start +` offset for the single-range case, the
    // exact same shift `trimProjectToRange` itself undid when it moved that range's own timeline zero;
    // see `mapToRealTime`'s own doc comment for the general, multi-range version of the same idea).
    // `data.detected_language` itself is no longer needed here — `chunkSegment`'s spacing is now read
    // straight from the real source text per word (see `TimedWord.leadingJoiner`'s own doc comment),
    // not guessed from an overall segment/job language.
    //
    // `pauseThreshold` is computed ONCE for the whole job (see `computePauseThreshold`'s own doc
    // comment for why job-wide, not per-segment) and reused for every segment's own chunking below —
    // this is what makes pause detection adapt to THIS recording's own pacing instead of one constant
    // shared by every job ever run.
    const pauseThreshold = computePauseThreshold(data.segments ?? []);
    const captions: CaptionSegment[] = (data.segments ?? [])
      .flatMap((s) => chunkSegment(s, wordHighlight, pauseThreshold))
      // `words` is already clip-relative (see `groupTimedWords`'s own comment on why it doesn't need
      // `mapToRealTime` at all) — passed through as-is, unlike `start`/`end` which are still relative
      // to the combined extracted audio at this point.
      .map((c) => ({ content: c.content, start: mapToRealTime(c.start), end: mapToRealTime(c.end), ...(c.words ? { words: c.words } : null) }))
      .filter((c) => c.content.length > 0 && c.end > c.start);

    // Kept as a permanent (not "temporary") diagnostic, not removed once this fix is confirmed working —
    // `pauseThreshold` is now computed fresh per job from a third-party provider's own real timestamp
    // quality, which can legitimately drift (a model update, a different accent/recording condition);
    // having this land in the logs for every real job, not just while actively debugging, is what makes
    // a future regression here diagnosable from production evidence instead of another live report +
    // guesswork cycle. Reports both what the job's own gap distribution actually looked like (so a
    // future reader can sanity-check `computePauseThreshold`'s own choices against real data) and the
    // ground-truth check for whether a real gap actually made it all the way through to the final
    // caption clips the client will place on the timeline.
    {
      const interWordGaps: number[] = [];
      for (const s of data.segments ?? []) {
        const words = s.words ?? [];
        let previousEnd: number | undefined;
        for (const w of words) {
          if (typeof w.start !== "number" || typeof w.end !== "number") continue;
          if (previousEnd !== undefined) interWordGaps.push(w.start - previousEnd);
          previousEnd = w.end;
        }
      }
      const maxInterWordGap = interWordGaps.reduce((m, g) => Math.max(m, g), 0);
      let maxClipGap = 0;
      let gapCount = 0;
      for (let i = 1; i < captions.length; i++) {
        const gap = captions[i].start - captions[i - 1].end;
        if (gap > 0.01) gapCount++;
        maxClipGap = Math.max(maxClipGap, gap);
      }
      console.log(
        `[vcut] captions job ${job.id}: pauseThreshold=${pauseThreshold.toFixed(3)}s from ${interWordGaps.length} real inter-word gap(s) (max=${maxInterWordGap.toFixed(3)}s) -> ${captions.length} caption clip(s), ${gapCount} with a real gap before them, max clip gap=${maxClipGap.toFixed(3)}s`
      );
    }

    job.captions = captions;
    job.status = "done";
    job.progress = 1;
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? (err as { code: string }).code : undefined;
    const isAbort = err instanceof Error && err.name === "AbortError";
    job.status = code === "cancelled" || isAbort ? "cancelled" : "failed";
    if (job.status === "failed") {
      // `ApiError`s thrown by this route's OWN code ("That clip no longer exists", "Set your Replicate
      // API key first", ...) are deliberately user-facing and safe to show verbatim regardless of
      // platform. Anything else reaching here in hosted mode — a network failure, or a raw error the
      // Replicate SDK itself throws on a failed/canceled prediction (its own message can mention
      // Replicate-account-specific details, the same "not this stranger's business" reasoning
      // `inpaint/route.ts`'s own identical sanitization documents) — was never vetted as safe to
      // expose, so it's sanitized here instead. Logged in full server-side either way so it's still
      // actually diagnosable.
      if (VCUT_HOSTED && !(err instanceof ApiError)) {
        console.error("[vcut] captions: job failed:", err);
        job.error = "Auto Captions is temporarily unavailable — please try again later.";
      } else {
        job.error = err instanceof Error ? err.message : String(err);
      }
      // Refunded — by the time this job runner is even running at all, `POST`'s own `spend()` already
      // succeeded (see `hostedCreditGatedRoute`'s own doc comment), so an outright failure here means
      // the user paid for an attempt that produced nothing. Not extended to `cancelled` (the OTHER
      // branch of this same `if`) — a user-initiated cancel mid-flight may already have incurred real
      // provider-side cost (the audio had already reached Replicate, for instance), unlike a clean
      // failure before anything of value happened.
      if (VCUT_HOSTED && job.ownerId) void refundCredits(job.ownerId, job.spentAmount);
    }
  } finally {
    job.currentProcess = null;
    job.currentCancel = null;
    job.notify();
    fs.rm(audioPath, { force: true }, () => {});
    // Only meaningfully different from `audioPath` for a multi-range job (see this function's own
    // opening comment) — a no-op `rm` of a path that was never created for the single-range case.
    for (const p of partPaths) if (p !== audioPath) fs.rm(p, { force: true }, () => {});
    fs.rm(concatListPath, { force: true }, () => {});
    setTimeout(() => jobs.delete(job.id), 60_000).unref?.();
  }
}

/** Starts an Auto Captions job and returns immediately with a job id — mirrors `inpaint/route.ts`'s
 *  own fire-and-track-via-SSE shape. `clipIds` present = one range per listed clip (a single-clip
 *  selection, or several — see `runCaptionsJob`'s own doc comment for how multiple get combined into
 *  one transcription pass without their in-between gaps ever reaching the model); absent or empty =
 *  the whole sequence, one range spanning it all. `language` is a Whisper language code (see
 *  `openai/whisper`'s own `LANGUAGES`/`TO_LANGUAGE_CODE`, confirmed against `replicate/cog-whisper`'s
 *  `predict.py`) or `"auto"` to let the model detect it — passed straight through to
 *  `runCaptionsJob`, never validated against the exact allowed set here: an invalid value is
 *  Replicate's own model to reject (surfacing as a normal job failure), not worth duplicating that
 *  list of ~100 codes just to pre-validate. */
export const POST = hostedCreditGatedRoute("captions", CAPTIONS_CREDITS_PER_MINUTE, async (req, user, spend) => {
  const bpProjectId = new URL(req.url).searchParams.get("projectId");
  if (!bpProjectId) throw new ApiError(400, "Missing projectId", "missing-project-id");

  const availability = ffmpegAvailable();
  if (!availability.available) throw new ApiError(500, availability.reason ?? "FFmpeg is unavailable", "ffmpeg-missing");
  if (!getInpaintKeyStatus().configured.replicate) throw new ApiError(400, "Set your Replicate API key first", "no-api-key");

  const body = (await req.json().catch(() => ({}))) as { clipIds?: string[]; language?: string; wordHighlight?: boolean };
  const language = typeof body.language === "string" && body.language.trim() ? body.language.trim() : "auto";
  const wordHighlight = body.wordHighlight === true;

  const paths = ensureProjectDirs(bpProjectId);
  if (!fs.existsSync(paths.projectFile)) throw new ApiError(404, "Project not found", "project-missing");
  const project = deserializeProject(fs.readFileSync(paths.projectFile, "utf8"));

  let ranges: CaptionRange[];
  if (Array.isArray(body.clipIds) && body.clipIds.length > 0) {
    // Tolerant of a clip that's since been deleted or genuinely has no audio — same "not every clip in
    // a selection has to qualify" precedent `DuplicateClipsCommand`/the toolbar's own Extract Audio
    // gating already set, rather than failing the whole job over one clip in a multi-clip selection.
    ranges = body.clipIds
      .map((clipId) => {
        const found = findClip(project, clipId);
        if (!found) return null;
        const asset = findAsset(project, found.clip.assetId);
        if (!asset?.hasAudio) return null;
        const start = found.clip.timelineStart;
        const end = start + clipDuration(found.clip);
        return end > start ? { start, end } : null;
      })
      .filter((r): r is CaptionRange => r !== null)
      // Chronological, not selection order — a natural reading order for the resulting transcript
      // regardless of the order the clips happened to be clicked/shift-clicked in.
      .sort((a, b) => a.start - b.start);
    if (ranges.length === 0) throw new ApiError(400, "None of the selected clips have audio to transcribe", "no-audio");
  } else {
    const total = sequenceDuration(project);
    ranges = total > 0 ? [{ start: 0, end: total }] : [];
  }
  if (ranges.length === 0) throw new ApiError(400, "There is nothing on the timeline to transcribe", "empty-range");

  const totalSeconds = ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
  const cost = Math.max(CAPTIONS_CREDITS_PER_MINUTE, Math.ceil(totalSeconds / 60) * CAPTIONS_CREDITS_PER_MINUTE);

  // Every upfront check above has passed — this is genuinely about to do real, billable work, so
  // this is the right moment to actually spend (see `hostedCreditGatedRoute`'s own doc comment for
  // why that's not done automatically before the handler runs at all).
  await spend(cost);

  const id = crypto.randomUUID();
  const job = {
    id,
    status: "running" as JobStatus,
    stage: "extracting-audio" as Stage,
    progress: 0,
    currentProcess: null,
    currentCancel: null,
    abortController: new AbortController(),
    spentAmount: cost,
    ...(user ? { ownerId: user.id } : null),
  } as CaptionsJob;
  const notifier = makeNotifier(job);
  job.changed = notifier.changed;
  job.notify = notifier.notify;
  jobs.set(id, job);

  void runCaptionsJob(job, bpProjectId, ranges, language, wordHighlight).catch(() => {
    // runCaptionsJob already handles its own errors internally (job.status/error) — this catch exists
    // only to guarantee an unexpected throw inside it can never become an unhandled rejection.
  });

  return Response.json({ jobId: id });
});

/** Streams progress as Server-Sent Events until the job reaches a terminal state — identical shape to
 *  `inpaint/route.ts`'s GET, with `captions` included once done so the client needs no second
 *  round-trip before landing them on the timeline. */
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

/** Reports whether Auto Captions is usable right now — FFmpeg present AND a Replicate token saved (in
 *  hosted mode, the same server-owned token Remove Object uses, from `_lib/inpaintEnvFile.ts`'s own
 *  `VCUT_HOSTED` branch, always "saved" once Railway's `VCUT_HOSTED_REPLICATE_API_TOKEN` is set — this
 *  reports capability, not credits; a 0-credit user still gets 204 here and finds out about
 *  insufficient credits from `billing/status` instead, same split `RemoveObjectSection`'s own UI
 *  already draws between "available" and "ready"). */
export const HEAD = hostedSessionRoute(async () => {
  const available = ffmpegAvailable().available && getInpaintKeyStatus().configured.replicate;
  return new Response(null, { status: available ? 204 : 503 });
});
