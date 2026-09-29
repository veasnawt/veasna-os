import { execFile, type ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { buildExportPlan, clipNeedsBrowserTextRender } from "@veasnawt/vcut/src/export/buildExportPlan";
import { renderKhmerClipWindows, type KhmerTextWindow } from "@veasnawt/vcut/src/export/khmerTextRenderer";
import { clipHasParentAnimation, parentPose } from "@veasnawt/vcut/src/project/groups";
import {
  OUTRO_BG_ASSET_ID,
  OUTRO_BG_SIZE,
  OUTRO_CACHE_VERSION,
  OUTRO_DURATION_SECONDS,
  OUTRO_FADE_SECONDS,
  OUTRO_LOGO_ASSET_ID,
  OUTRO_LOGO_HEIGHT,
  OUTRO_LOGO_SCALE,
  OUTRO_LOGO_WIDTH,
  OUTRO_TEXT_CONTENT,
  outroLogoOffsetY,
  outroTextStyle,
} from "@veasnawt/vcut/src/export/outro";
import { createClip, createTextAsset, createTrack, sequenceDuration } from "@veasnawt/vcut/src/project/createProject";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import { isIdentityTextCrop, type Project } from "@veasnawt/vcut/src/project/types";
import type { Asset, Clip } from "@veasnawt/vcut/src/project/types";
import { resolveTextStyle, resolveTextCrop, hasTextCropKeyframes, hasTextStyleKeyframes } from "@veasnawt/vcut/src/timeline/keyframes";
import { checkProjectOwnership, requireSessionUser, VCUT_HOSTED } from "../_lib/auth";
import { beginHeavyFfmpegJob, endHeavyFfmpegJob, MAX_CONCURRENT_HOSTED_EXPORTS } from "../_lib/ffmpegConcurrency";
import { buildCustomFontDataUrls, openKhmerTextHarness } from "../_lib/khmerTextHarness";
import { ffmpegAvailable, ffmpegBinary, fontMetricsFor, fontsDirPath, probeMedia, runFfmpeg, textFontPath } from "../_lib/ffmpeg";
import { localRoute, publicSessionRoute } from "../_lib/localOnly";
import { outroBackgroundPath, outroLogoPath } from "../_lib/outroAssets";
import { resolveLutFilePath } from "../_lib/lutFile";
import { ApiError, ensureProjectDirs, type ProjectPaths, resolveWithin, userMediaPaths, VCUT_ROOT } from "../_lib/paths";
import { getProfile } from "../_lib/profiles";
import { resolveUserEntitlements } from "../_lib/billingCore";
import { resolveAssetInputPath } from "../_lib/assetInput";
import { defaultExportJobStore, isDurableQueueActive } from "../_lib/exportQueue";
import type { DurableExportJob } from "../_lib/exportJobs";
import { executeExportRender } from "../_lib/exportRenderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether `runExportJob` should append the branded end card to THIS export — the actual Pro perk
 *  (see this feature's own top-level request: free exports carry it, Pro exports don't, no manual
 *  toggle). Hosted-only: desktop/local dev has no credits/plan system at all (every other Pro-gated
 *  feature — Remove Object, Auto Captions — is the same "no such concept off the hosted deploy"
 *  scope cut, via `hostedCreditGatedRoute` falling back to plain `localRoute` behavior there), so an
 *  outro tied to a plan that doesn't exist locally would have nothing meaningful to gate on.
 *
 *  Re-derives the session user independently rather than threading one through from `localRoute`'s
 *  own (already-performed) check — same pattern `checkJobOwnership` already uses for the same reason:
 *  `localRoute` never passes its resolved user to the handler at all. */
async function shouldIncludeOutro(req: Request): Promise<boolean> {
  // TEMP diagnostic — isolating whether the outro itself contributes to a real, reported OOM on a
  // specific hosted export, or whether that project independently exceeds the container's memory
  // budget regardless. Toggled via a Railway env var (no rebuild needed) rather than commenting out
  // the feature, so the SAME deployed image can be tested both ways back to back. Remove once answered.
  if (process.env.VCUT_DISABLE_OUTRO === "true") return false;
  if (!VCUT_HOSTED) {
    try {
      const header = req.headers.get("authorization") ?? "";
      let token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
      if (!token) token = new URL(req.url).searchParams.get("token") ?? "";
      if (token) {
        const user = await requireSessionUser(req);
        const entitlement = await resolveUserEntitlements(user.id);
        return !entitlement.isPro;
      }
    } catch {
      // In local dev without network/Supabase, treat unauthenticated as free
    }
    return true;
  }
  const user = await requireSessionUser(req);
  const entitlement = await resolveUserEntitlements(user.id);
  return !entitlement.isPro;
}

/** Builds a STANDALONE, throwaway project containing ONLY the branded end card — a solid black
 *  background clip plus the VCut logo fading and scaling in on top of it, at `timelineStart: 0`. NOT
 *  spliced into the real `project`'s own tracks (an earlier version of this did exactly that): every
 *  track in `buildExportPlan.ts` gets padded out to the export's own single global `duration` with a
 *  synthetic gap-fill segment when its own clips end sooner (`buildSegments`'s own trailing-gap check)
 *  — extending the real project's OWN sequence duration by `OUTRO_DURATION_SECONDS` therefore forced
 *  an extra gap segment onto EVERY OTHER TRACK the user's project already had, not just the two this
 *  feature adds. Confirmed live as the actual cause of a real reported OOM on an otherwise-short,
 *  already-marginal hosted export: switching the logo's fade from keyframes to the cheaper
 *  `transitionIn`/`transitionOut` path (see git history) did NOT fix it, because the cost was never in
 *  the outro's own two clips — it scales with how many tracks the user's project happens to have.
 *
 *  Rendering this as its own tiny, isolated `buildExportPlan` job sidesteps that multiplier entirely:
 *  its own `sequenceDuration` naturally equals `OUTRO_DURATION_SECONDS` (nothing else to gap-fill
 *  against), so its cost is constant regardless of how complex the real project is. `runOutroStep`
 *  below renders this separately and stream-copy-concats the result onto the main render — see its own
 *  doc comment for why that's safe (matching codec/dimensions/fps by construction, both plans coming
 *  from the SAME source `project`) and why a failure here never loses an otherwise-successful main
 *  render. `inputPathFor` in both this project's own plan and the main one special-cases both asset
 *  ids to resolve to the two bundled PNGs directly (see `outroAssets.ts`'s own top comment for why the
 *  background is a bundled image and not `Asset.kind === "color"`). Spreading `project` first means
 *  every OTHER required `Project` field (schemaVersion, exportSettings, luts, customFonts, ...) is
 *  already valid by construction, and `exportSettings`/`sequence.width/height/fps` match the main
 *  render exactly — required for the two renders' output streams to actually be concat-compatible. */
function buildOutroOnlyProject(project: Project): Project {
  const bgAsset = {
    id: OUTRO_BG_ASSET_ID,
    kind: "image" as const,
    name: "Outro background",
    relPath: "",
    duration: 0,
    hasAudio: false,
    sizeBytes: 0,
    importedAt: Date.now(),
    width: OUTRO_BG_SIZE,
    height: OUTRO_BG_SIZE,
  };
  const logoAsset = {
    id: OUTRO_LOGO_ASSET_ID,
    kind: "image" as const,
    name: "VCut logo",
    relPath: "",
    duration: 0,
    hasAudio: false,
    sizeBytes: 0,
    importedAt: Date.now(),
    width: OUTRO_LOGO_WIDTH,
    height: OUTRO_LOGO_HEIGHT,
  };

  const bgTrack = createTrack("video", "Outro Background");
  bgTrack.clips.push(createClip({ assetId: bgAsset.id, sourceIn: 0, sourceOut: OUTRO_DURATION_SECONDS, timelineStart: 0 }));

  // Later tracks composite ON TOP of earlier ones (see the "Every visible video track" comment
  // further down this file) — background pushed first, logo second, so the logo always draws over
  // its own background.
  const logoTrack = createTrack("video", "Outro Logo");
  const logoClip = createClip({ assetId: logoAsset.id, sourceIn: 0, sourceOut: OUTRO_DURATION_SECONDS, timelineStart: 0 });
  logoClip.transform = {
    offsetX: 0,
    offsetY: outroLogoOffsetY(project.sequence.width, project.sequence.height),
    scale: OUTRO_LOGO_SCALE,
    rotationDeg: 0,
    crop: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  // A plain `transitionIn`/`transitionOut` fade, not `effectsKeyframes` — ANY keyframed clip
  // (`hasTransformKeyframes`/`hasEffectsKeyframes`/`hasColorGradingKeyframes` — see
  // buildExportPlan.ts's own per-segment check) goes through the expensive PER-SLICE rendering path
  // built for genuinely animated content, redecoding the same static image once per slice interval
  // instead of once for the whole clip. A two-point opacity ramp has no need for that machinery;
  // `transitionIn`/`transitionOut` render through a completely separate, un-sliced path (a solo fade
  // with no predecessor/successor — see `Clip.transitionIn`'s own doc comment) for a fraction of the
  // cost. Fading "from black" (that doc comment's own wording for a video/image clip's solo fade)
  // reads correctly here specifically because the background track beneath is already solid black.
  logoClip.transitionIn = { duration: OUTRO_FADE_SECONDS, type: "crossfade" };
  logoClip.transitionOut = { duration: OUTRO_FADE_SECONDS, type: "crossfade" };
  logoTrack.clips.push(logoClip);

  // The "VCut" wordmark below the logo — see `outroTextStyle`'s own doc comment for why its size/
  // position are computed from the sequence's own dimensions rather than fixed constants, and
  // `buildOutroPreviewProject`'s matching branch for why the two render paths must stay identical.
  const textAsset = createTextAsset(OUTRO_TEXT_CONTENT, outroTextStyle(project.sequence.width, project.sequence.height));
  const textTrack = createTrack("text", "Outro Text");
  const textClip = createClip({ assetId: textAsset.id, sourceIn: 0, sourceOut: OUTRO_DURATION_SECONDS, timelineStart: 0 });
  textClip.transitionIn = { duration: OUTRO_FADE_SECONDS, type: "crossfade" };
  textClip.transitionOut = { duration: OUTRO_FADE_SECONDS, type: "crossfade" };
  textTrack.clips.push(textClip);

  return {
    ...project,
    assets: [bgAsset, logoAsset, textAsset],
    sequence: { ...project.sequence, tracks: [bgTrack, logoTrack, textTrack] },
  };
}

/** Resolves the two outro assets to their bundled PNGs regardless of which plan (main or outro-only)
 *  is asking — shared so both `runOutroStep` and the main plan's own `inputPathFor` stay in sync
 *  without duplicating the id checks. Returns `null` for anything else, so each caller's own
 *  `inputPathFor` can fall through to its normal per-project asset resolution. */
function resolveOutroAssetPath(assetId: string): string | null {
  if (assetId === OUTRO_LOGO_ASSET_ID) return outroLogoPath();
  if (assetId === OUTRO_BG_ASSET_ID) return outroBackgroundPath();
  return null;
}

/** A fixed, reasonably high quality — not `project.exportSettings.crf` — because the render this
 *  produces is now cached and shared across every export that happens to want the same resolution/fps
 *  (see `outroCacheDir`'s own doc comment), independent of any one export's own quality choice. `-c
 *  copy` concat doesn't require the two segments to share a CRF, only matching codec/resolution/fps/
 *  pixel format, so there's no correctness reason to vary this — just one good-enough constant. */
const OUTRO_CRF = 18;

/** Where a pre-rendered outro variant lives once rendered — under `VCUT_ROOT` (the same persistent,
 *  restart-surviving root every project's own files live under — see `paths.ts`'s own doc comment for
 *  why that's a real mounted volume in hosted mode, not ephemeral container storage), NOT inside any
 *  one project's own directory or the per-export `scratchDir`: this cache is shared across every
 *  project and every export, keyed by the three parameters that actually affect stream compatibility
 *  for `-c copy` concat (width/height/fps — see `runOutroStep`'s own doc comment) PLUS
 *  `OUTRO_CACHE_VERSION` (see its own doc comment for why: those three alone aren't enough once the
 *  outro's own visual CONTENT can change independently of resolution/fps). */
function outroCacheDir(): string {
  const dir = path.join(VCUT_ROOT, "outro-cache");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Renders (and persistently caches) the outro-only project for one exact `(width, height, fps)`
 *  combination, then returns its path — a real, meaningful cost cut on top of `buildOutroOnlyProject`'s
 *  own "isolated render avoids the gap-fill multiplier" fix: with only `RESOLUTION_PRESETS.length *
 *  FPS_PRESETS.length` (15 today) possible combinations, the FIRST export at a given combination pays
 *  the cost of actually running `buildExportPlan`+FFmpeg for the outro; every export after that, at
 *  that same combination, skips straight to the cheap stream-copy concat below with no second FFmpeg
 *  filter-graph render at all. Render-then-atomic-`renameSync` (not writing the cache path directly) is
 *  what makes this safe under two exports racing in for the same never-yet-cached combination at once:
 *  a reader either sees the complete prior file or the complete new one, never a half-written one a
 *  concurrent renderer is still writing to. */
async function getOrRenderOutroVariant(project: Project, scratchDir: string): Promise<string> {
  const { width, height, fps } = project.sequence;
  const cacheDir = outroCacheDir();
  // `OUTRO_CACHE_VERSION` in the filename — see its own doc comment: this is what makes a future visual
  // change to the outro actually take effect on the NEXT export at a resolution/fps some earlier export
  // already rendered and cached, instead of silently continuing to serve that stale file forever.
  const cachePath = path.join(cacheDir, `outro-v${OUTRO_CACHE_VERSION}-${width}x${height}-${fps}fps.mp4`);
  if (fs.existsSync(cachePath)) return cachePath;

  const outroProject = buildOutroOnlyProject(project);
  // Rendered directly into `cacheDir` (not `scratchDir`, a different OS-tmpdir-based filesystem) under
  // a throwaway name, THEN renamed to `cachePath` — `renameSync` is only atomic within a single
  // filesystem/mount; across the two (the container's own ephemeral `/tmp` vs. the persistent volume
  // this cache lives on) it fails outright with `EXDEV`. Same directory start-to-finish keeps the
  // rename atomic while still avoiding ever exposing a concurrent reader to a half-written file.
  const renderPath = path.join(cacheDir, `.tmp-${crypto.randomUUID()}.mp4`);
  const outroPlan = buildExportPlan(outroProject, {
    inputPathFor: (assetId) => {
      const resolved = resolveOutroAssetPath(assetId);
      if (!resolved) throw new ApiError(500, "Unexpected asset in outro-only project", "outro-bad-asset");
      return resolved;
    },
    outputPath: renderPath,
    fontPathFor: (fileName) => textFontPath(fileName),
    textFilePathFor: (clip, content, variant) => {
      const filePath = path.join(scratchDir, `outro-${clip.id}${variant ? `-${variant}` : ""}.txt`);
      fs.writeFileSync(filePath, content, "utf8");
      return filePath;
    },
    assFilePathFor: (clip, assContent) => {
      const filePath = path.join(scratchDir, `outro-${clip.id}.ass`);
      fs.writeFileSync(filePath, assContent, "utf8");
      return filePath;
    },
    fontMetricsFor,
    fontsDirFor: fontsDirPath,
    khmerTextWindowsFor: () => undefined,
    // Matches the main export's own `videoEncoderArgs` (see that call site's own comment for why
    // `medium`/`-threads 8`, not `veryfast`/`2`, now that this service runs a 24 vCPU Pro-plan
    // allocation, not the ~2 vCPU this pair was originally tuned against) — kept in sync so a
    // project's outro segment doesn't visibly re-encode at a lower quality than the segment it's
    // being appended to.
    ...(VCUT_HOSTED ? { videoEncoderArgs: ["-c:v", "libx264", "-preset", "medium", "-crf", String(OUTRO_CRF), "-threads", "8"] } : null),
  });

  try {
    const outroRun = runFfmpeg(outroPlan.args, outroPlan.duration, () => {});
    await outroRun.done;
    fs.renameSync(renderPath, cachePath);
    return cachePath;
  } catch (err) {
    fs.rmSync(renderPath, { force: true });
    throw err;
  }
}

/** Gets (rendering + caching if needed — see `getOrRenderOutroVariant`'s own doc comment) the outro
 *  variant matching `project`'s own resolution/fps, then stream-copy-concats it onto `mainPath` into
 *  `finalPath` — no re-encode of the main content, just a remux, since both files share identical
 *  codec/dimensions/fps/audio parameters by construction (both plans built from the same source
 *  `project`, both hosted plans given the same `videoEncoderArgs`). FFmpeg's own concat DEMUXER (not
 *  the `concat` FILTER, which would require fully re-decoding and re-encoding `mainPath` all over
 *  again just to attach a 2.5s tail — exactly the wasted work this whole redesign exists to avoid) is
 *  documented as safe for exactly this "stitch pre-rendered segments with matching codec parameters"
 *  case. Every export always maps both a video AND an audio stream (`buildExportPlan`'s own closing
 *  `-map`s — see its own comment), so the outro's stream layout matches `mainPath`'s even when the
 *  real project has no audio of its own. */
async function runOutroStep(project: Project, scratchDir: string, mainPath: string, finalPath: string): Promise<void> {
  const outroPath = await getOrRenderOutroVariant(project, scratchDir);

  const listPath = path.join(scratchDir, "concat-list.txt");
  // FFmpeg's own concat-demuxer list format: single-quoted paths, backslash-escaping any literal
  // single quote — the standard escape that format itself documents, not a generic shell-escaping
  // convention (this file is read by FFmpeg's own parser, never a shell).
  const escaped = (p: string) => p.replace(/'/g, "'\\''");
  fs.writeFileSync(listPath, `file '${escaped(mainPath)}'\nfile '${escaped(outroPath)}'\n`, "utf8");

  await new Promise<void>((resolve, reject) => {
    execFile(
      ffmpegBinary(),
      ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", finalPath],
      { timeout: 30_000 },
      (err) => (err ? reject(err) : resolve())
    );
  });
}

/** Extracts the frame at `time` seconds into `videoPath` (the MAIN project's own timeline — see
 *  `ExportSettings.cover`'s own `{ kind: "frame" }` doc comment) as a real JPEG, via the same
 *  `-ss <t> -i <input> -frames:v 1` shape `buildThumbnailArgs` uses elsewhere — written inline rather
 *  than reusing that function directly since it also force-scales to a fixed 320px thumbnail width,
 *  which would visibly downgrade a cover meant to represent the real export's own full resolution.
 *  Reading from `videoPath` (the fully composited output, not a source asset) guarantees the cover
 *  matches whatever crop/overlay/text/color-grading the real export applied — not a naive frame from
 *  untouched footage. */
async function extractCoverFrameJpeg(scratchDir: string, videoPath: string, time: number): Promise<string> {
  const coverJpegPath = path.join(scratchDir, "cover.jpg");
  await new Promise<void>((resolve, reject) => {
    execFile(
      ffmpegBinary(),
      ["-y", "-ss", String(Math.max(0, time)), "-i", videoPath, "-frames:v", "1", "-q:v", "2", coverJpegPath],
      { timeout: 30_000 },
      (err) => (err ? reject(err) : resolve())
    );
  });
  return coverJpegPath;
}

/** Muxes `coverImagePath` into `videoPath` as a SECOND video stream with `disposition:attached_pic` —
 *  the same iTunes-style cover-art mechanism QuickTime/Photos/most players and messaging apps already
 *  recognize as a file's own preview image, without decoding/seeking into the real video stream at
 *  all. `-c copy` on the main streams (video+audio unchanged, a remux not a re-encode) with `-c:v:1
 *  mjpeg` only on the newly-added cover stream (`:v:1` — ffmpeg's own type-relative stream specifier,
 *  "the SECOND stream of type video," not an absolute output index) transcodes WHATEVER format
 *  `coverImagePath` is (a JPEG `extractCoverFrameJpeg` just produced, or an arbitrary user-uploaded
 *  PNG/WEBP/etc — ffmpeg's own image decoders handle either as an ordinary input) into the one format
 *  every player expects an attached-pic stream to be. Cheap regardless of the real export's own
 *  length, the same "seconds, not a second full encode" cost `runOutroStep`'s own concat-demuxer remux
 *  above already relies on.
 *
 *  Writes into a fresh temp file first, then overwrites `videoPath` via `renameSync` — ffmpeg can't
 *  read and write the same path in one invocation, and this avoids ever leaving `videoPath` (which the
 *  export job's own `outputPath` already points real, possibly-in-progress-of-being-served bytes at)
 *  in a partially-written state if this step is interrupted. Best-effort at the CALL SITE (see
 *  `runExportJob`'s own comment): a failure here should cost the user nothing more than "no cover
 *  embedded," never the whole export. */
async function runCoverArtStep(videoPath: string, coverImagePath: string): Promise<void> {
  // Same directory as `videoPath` itself, NOT the scratch dir the caller may have used to produce
  // `coverImagePath` — that lives under the container's own ephemeral `os.tmpdir()`, a DIFFERENT
  // filesystem/mount from `videoPath`'s own home on the persistent volume. Confirmed directly as a
  // real bug, not a theoretical one: `renameSync` below failed every time with `EXDEV: cross-device
  // link not permitted` before this fix — the exact trap `getOrRenderOutroVariant`'s own doc comment
  // already documents ("same directory start-to-finish keeps the rename atomic") for the identical
  // reason, just not followed here the first time around.
  const muxedPath = path.join(path.dirname(videoPath), `.tmp-cover-${crypto.randomUUID()}.mp4`);
  await new Promise<void>((resolve, reject) => {
    execFile(
      ffmpegBinary(),
      [
        "-y",
        "-i",
        videoPath,
        "-i",
        coverImagePath,
        "-map",
        "0",
        "-map",
        "1",
        "-c",
        "copy",
        "-c:v:1",
        "mjpeg",
        "-disposition:v:1",
        "attached_pic",
        "-movflags",
        "+faststart",
        muxedPath,
      ],
      { timeout: 30_000 },
      (err) => (err ? reject(err) : resolve())
    );
  });
  fs.renameSync(muxedPath, videoPath);
}

type JobStatus = "running" | "done" | "failed" | "cancelled";

/** `preparing`/`rendering-text` cover everything BEFORE FFmpeg exists to report real numeric
 *  progress — the Khmer pre-pass's own headless-Chromium launch and per-window rendering, which used
 *  to leave the client staring at a static, unexplained "0%" for however long that took (measured
 *  directly at 15-40+ seconds on this app's own machine). `job.message` carries a human-readable
 *  status for exactly those two phases; `encoding` is everything after, where `job.progress` is the
 *  real, meaningful number and the UI goes back to showing a percentage. */
type JobPhase = "preparing" | "rendering-text" | "encoding";

interface ExportJob {
  id: string;
  bpProjectId: string;
  status: JobStatus;
  phase: JobPhase;
  message?: string;
  progress: number;
  outputPath: string;
  fileName: string;
  error?: string;
  savedPath?: string;
  saveError?: string;
  /** Doesn't exist until `phase` reaches `encoding` — cancelling any earlier phase (see `DELETE`
   *  below) has no live process to kill, only this flag to check between the pre-pass's own awaits. */
  process?: ChildProcess;
  /** `runFfmpeg`'s own `cancel()` — the only correct way to stop `process` once it exists (see that
   *  function's own doc comment on why killing `process` directly makes an intentional cancel
   *  indistinguishable from the kernel OOM-killer's identical `SIGKILL`). `DELETE` below is this
   *  job's only genuine cancel path; `reapStaleJobs` kills `process` directly instead, on purpose —
   *  a hung job isn't a user cancel, and forcing it through this path would misreport it as one. */
  cancel?: () => void;
  /** Checked between each `await` in the pre-pass (there's no child process to kill yet there — see
   *  `process`'s own comment) so `DELETE` can still cancel a job that hasn't reached FFmpeg yet,
   *  instead of leaving it to run to completion unstoppably just because it started slow. */
  cancelRequested: boolean;
  /** Resolved whenever progress or status changes, so the SSE stream can wait for real news instead
   *  of polling on a timer. Replaced on every change — waiters take a fresh one each loop. */
  changed: Promise<void>;
  notify: () => void;
  /** Bumped by every `notify()` call — what the stale-job reaper (below) uses to tell "a slow but
   *  genuinely progressing export" apart from "a hung one that will never finish on its own." See
   *  `MAX_CONCURRENT_HOSTED_EXPORTS`'s own doc comment for why a stuck job is a much worse bug on a
   *  single-instance service capped at a small concurrency limit than it would be otherwise: it
   *  doesn't just fail its own export, it permanently occupies a concurrency SLOT — confirmed live,
   *  not hypothetical, as a real incident: a job that stalled mid-encode with no code path that ever
   *  marked it "done"/"failed"/"cancelled" sat in `jobs` reporting `status: "running"` forever, and
   *  with the concurrency cap at 1 that meant EVERY subsequent export attempt — on ANY project, by
   *  ANY user — hit "The server is at capacity" until the container was manually restarted. */
  lastActivityAt: number;
}

/** Jobs live in module memory for the lifetime of the server process. That's the right scope for a
 *  local, single-user editor: an export belongs to the running app, and if the server restarts
 *  mid-export the child process dies with it anyway, so there'd be nothing for a persisted record to
 *  point at. (In `next dev`, a hot reload can replace this module and orphan the map — the FFmpeg
 *  child is still killed on process exit, and the UI surfaces the lost job rather than hanging.) */
const jobs = new Map<string, ExportJob>();

// `MAX_CONCURRENT_HOSTED_EXPORTS` itself now lives in `_lib/ffmpegConcurrency.ts` — moved there so
// `_lib/templates.ts`'s own template-preview rendering can wait on the SAME configured limit instead
// of running with no concurrency awareness at all (see that module's own doc comment for the real,
// reported regression that caused). Behavior here is unchanged: hosted-mode-only cap on TOTAL
// simultaneous exports across every project/user sharing this one Railway service instance — job state
// here is per-process, so there's no way to spread this across replicas even if the deployment ever ran
// more than one (it doesn't; this app is deployed as a single instance, never horizontally scaled, for
// exactly this reason). The per-project check above already stops the SAME project double-exporting;
// this stops five DIFFERENT users each starting one at once from piling multiple Khmer-text Chromium
// instances and FFmpeg encodes onto one modest machine. Not enforced in desktop/local mode.

function makeNotifier(job: Partial<ExportJob>): { changed: Promise<void>; notify: () => void } {
  let resolve!: () => void;
  const changed = new Promise<void>((r) => (resolve = r));
  return {
    changed,
    notify: () => {
      (job as ExportJob).lastActivityAt = Date.now();
      resolve();
      const next = makeNotifier(job);
      (job as ExportJob).changed = next.changed;
      (job as ExportJob).notify = next.notify;
    },
  };
}

/** How long a "running" job can go with NO `notify()` call at all before the reaper below treats it
 *  as hung rather than genuinely slow. Generous on purpose: `runFfmpeg`'s own progress callback and
 *  every pre-pass phase transition call `notify()` far more often than this during real, healthy
 *  work — silence this long is already a strong sign nothing is actually happening, not just a slow
 *  clip. */
const STALE_JOB_TIMEOUT_MS = 5 * 60 * 1000;
/** How often the reaper actually checks — cheap (a handful of Map entries, a Date.now() comparison
 *  each), no reason to run it more often than a small fraction of the timeout itself. */
const STALE_JOB_SWEEP_INTERVAL_MS = 60 * 1000;

/** Frees a hung job's concurrency slot automatically — the actual fix for a real incident (see
 *  `ExportJob.lastActivityAt`'s own doc comment): whatever originally causes a job to hang is a
 *  separate, still-open question, but NO cause of a hang should be able to wedge the entire export
 *  pipeline for every other project indefinitely. Kills the FFmpeg child if one exists (mirrors
 *  `DELETE`'s own cleanup) — a hung job's process, if any, is either already dead or itself part of
 *  the hang, so there's nothing lost by making sure it's gone. Runs on a bare `setInterval` at module
 *  scope, not tied to any one request, since a hang can happen with nobody actively watching the SSE
 *  stream to notice it. */
function reapStaleJobs(): void {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (job.status !== "running") continue;
    if (now - job.lastActivityAt < STALE_JOB_TIMEOUT_MS) continue;
    job.process?.kill("SIGKILL");
    job.status = "failed";
    job.error = "This export stalled and was stopped automatically — please try again.";
    job.notify();
    // Same cleanup delay every other terminal path in this file already gives a job — long enough
    // for an SSE client still watching to receive this final message before the job disappears out
    // from under it.
    setTimeout(() => jobs.delete(job.id), 60_000).unref?.();
  }
}
setInterval(reapStaleJobs, STALE_JOB_SWEEP_INTERVAL_MS).unref?.();

/** Starts an export and returns immediately with a job id — BEFORE the Khmer pre-pass or FFmpeg
 *  itself have done any real work, not just before FFmpeg finishes. Everything that actually takes
 *  time happens in `runExportJob`, fired here without an `await`: the response returns the instant
 *  the job is registered, so the client can start watching its SSE stream right away and see real
 *  status the whole time, instead of only learning a job exists once the pre-pass has already
 *  finished — which used to leave the dialog showing a static, unexplained "0%" for however long
 *  that took (measured directly at 15-40+ seconds on this app's own machine for a project with
 *  Khmer text). The render itself runs in a child process, so the UI thread and the server's event
 *  loop both stay responsive throughout either way. */
export const POST = localRoute(async (req) => {
  const url = new URL(req.url);
  const bpProjectId = url.searchParams.get("projectId");
  if (!bpProjectId) throw new ApiError(400, "Missing projectId", "missing-project-id");

  if (isDurableQueueActive()) {
    const active = await defaultExportJobStore.findActiveJob(bpProjectId);
    if (active) {
      throw new ApiError(409, "An export is already running for this project", "export-already-running");
    }

    const body = (await req.json()) as { project?: unknown; fileName?: string };
    if (!body?.project) throw new ApiError(400, "Missing project in request body", "missing-project");

    const project = deserializeProject(JSON.stringify(body.project));
    const includeOutro = await shouldIncludeOutro(req);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `${(body.fileName || project.name || "export").replace(/[^A-Za-z0-9._-]/g, "_")}-${stamp}.mp4`;

    const hostedUser = VCUT_HOSTED ? await requireSessionUser(req).catch(() => null) : null;
    const durableJob = await defaultExportJobStore.createJob({
      projectId: bpProjectId,
      userId: hostedUser?.id ?? null,
      fileName,
      project,
      includeOutro,
    });

    return Response.json({
      jobId: durableJob.id,
      fileName,
      duration: sequenceDuration(project),
      status: "queued",
    });
  }

  // Rejected up front, before any of the heavy work below (the Khmer pre-pass's own headless
  // Chromium launch, then FFmpeg itself) even starts — a SECOND export request for a project that
  // already has one running is never a legitimate "export something else too," it's a double-submit:
  // a repeated click while the dialog looked unresponsive, a second tab on the same project, or a
  // retry after a slow response the first request was actually going to answer just fine. Letting it
  // through used to stack a whole extra Chromium + FFmpeg process on top of the first, both fighting
  // the same machine for CPU/RAM — confirmed directly as a real path to the whole OS bogging down, not
  // just this one export: every repeated click while nothing seemed to be happening spawned yet
  // another pair of heavy processes rather than either reusing or replacing the one already in
  // flight. The existing job's own SSE stream already tells a client everything it needs to keep
  // watching, so there's nothing this loses for the legitimate case.
  //
  // The check AND the registration below have to happen in the same synchronous stretch of code,
  // with no `await` between them — confirmed directly as necessary, not just tidy, by firing two
  // requests for the same project at once and watching BOTH sail through when `jobs.set()` for a
  // real job only happened after several `await`s: two requests racing in could each check "is
  // anything running?", each see "no" (neither had registered yet), and both proceed — exactly the
  // double-submit this exists to stop, just delayed instead of prevented. Registering the job here,
  // before this function's first `await`, closes that window: JS has no thread interleaving
  // mid-synchronous-statement, so whichever request reaches this line first claims the slot before
  // the second one's own check can possibly run.
  let runningCount = 0;
  for (const existing of jobs.values()) {
    if (existing.status !== "running") continue;
    if (existing.bpProjectId === bpProjectId) {
      throw new ApiError(409, "An export is already running for this project", "export-already-running");
    }
    runningCount++;
  }
  if (VCUT_HOSTED && runningCount >= MAX_CONCURRENT_HOSTED_EXPORTS) {
    throw new ApiError(503, "The server is at capacity — try again in a moment", "export-capacity");
  }
  const id = crypto.randomUUID();
  const job = {
    id,
    bpProjectId,
    status: "running" as JobStatus,
    phase: "preparing" as JobPhase,
    progress: 0,
    outputPath: "",
    fileName: "",
    cancelRequested: false,
    lastActivityAt: Date.now(),
  } as ExportJob;
  const notifier = makeNotifier(job);
  job.changed = notifier.changed;
  job.notify = notifier.notify;
  jobs.set(id, job);

  try {
    const availability = ffmpegAvailable();
    if (!availability.available) throw new ApiError(500, availability.reason ?? "FFmpeg is unavailable", "ffmpeg-missing");

    const body = (await req.json()) as { project?: unknown; fileName?: string };
    if (!body?.project) throw new ApiError(400, "Missing project in request body", "missing-project");

    const project = deserializeProject(JSON.stringify(body.project));
    const includeOutro = await shouldIncludeOutro(req);
    const paths = ensureProjectDirs(bpProjectId);
    // Re-derives the session user independently rather than threading one through from `localRoute`'s
    // own check — same pattern `shouldIncludeOutro` above already uses, for the same reason (`localRoute`
    // never passes its resolved user to the handler). `null` on desktop/local dev, where no asset can
    // ever carry a `libraryMediaId` in the first place (see `assetSourceDir`'s own doc comment).
    const libraryMediaDir = VCUT_HOSTED ? userMediaPaths((await requireSessionUser(req)).id).mediaDir : null;

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `${(body.fileName || project.name || "export").replace(/[^A-Za-z0-9._-]/g, "_")}-${stamp}.mp4`;
    const outputPath = resolveWithin(paths.exportsDir, fileName);
    job.fileName = fileName;
    job.outputPath = outputPath;

    // Not awaited — see this function's own doc comment for why. Any failure from here on (a bad
    // Khmer render, `buildExportPlan` rejecting the project, FFmpeg itself failing) lands on the JOB
    // (`status`/`error`, surfaced over SSE) rather than this response, which has already gone out by
    // the time any of it could happen. `beginHeavyFfmpegJob`/`.finally(endHeavyFfmpegJob)` brackets
    // this job's WHOLE lifetime (not just its own `runFfmpeg` call) regardless of which of
    // `runExportJob`'s several internal exit paths it settles through, so `_lib/templates.ts`'s own
    // concurrency check sees an accurate count for as long as this export is actually using resources.
    beginHeavyFfmpegJob();
    void runExportJob(job, project, paths, outputPath, req.url, includeOutro, libraryMediaDir).finally(endHeavyFfmpegJob);

    return Response.json({ jobId: id, fileName, duration: sequenceDuration(project) });
  } catch (err) {
    jobs.delete(id);
    throw err;
  }
});

/** A source image well past this on its longer side gets pre-scaled down before FFmpeg's own
 *  compositing pass ever sees it — see `prescaleOversizedImageAssets`'s own doc comment for why.
 *  Generous headroom over any typical export resolution (1080p-class, occasionally a bit more) so a
 *  clip using Ken Burns/zoom effects still has real detail to zoom into, while still bounding the
 *  worst case: a modern phone photo (often 4000px+ on its long side, sometimes considerably more) can
 *  otherwise cost FFmpeg several times the decode-buffer memory an already-large 2200px image would,
 *  for zero visible benefit once scaled down to the sequence's own frame. */
const MAX_HOSTED_IMAGE_DIMENSION = 2200;

/** Caps how many browser-rendered text windows (`renderKhmerClipWindows`'s own PNG-per-window output —
 *  see that function's own doc comment) ONE export will produce in total, across every clip that needs
 *  the path (Khmer script, or a style FFmpeg's own text renderers can't draw — `needsTextStyleBrowserRender`).
 *  Each window is a real headless-Chromium screenshot, not a cheap FFmpeg operation, and an animated
 *  (bounce/pulse/wiggle/wordHighlight) clip can already produce up to `MAX_KEYFRAME_SLICES_PER_CLIP`
 *  (240) windows on its own — a project with several long animated, richly-styled captions could
 *  otherwise run this harness for a genuinely long time under real memory pressure on the SAME
 *  1GB-class container this file's other memory-conscious changes already protect (see
 *  `MAX_HOSTED_IMAGE_DIMENSION`'s own doc comment for the exact prior incident that class of change
 *  responds to). A clip whose OWN windows would push the running total past this cap is skipped
 *  entirely (not partially rendered) and falls through to plain `drawtext` for that one clip instead —
 *  loses its gradient/glow/layered-shadow styling in the export specifically, rather than risking the
 *  whole export. Desktop/local dev keep this uncapped (`Infinity`) — the same "no shared-container
 *  ceiling to protect" reasoning `prescaleOversizedImageAssets` already documents. Comfortably above
 *  what any real project needs in practice; only a genuinely pathological timeline (many long,
 *  animated, styled captions) would ever reach it. */
const MAX_BROWSER_TEXT_WINDOWS_PER_EXPORT = VCUT_HOSTED ? 600 : Infinity;

/** Pre-scales any source IMAGE asset whose longer side exceeds `MAX_HOSTED_IMAGE_DIMENSION` into a
 *  scratch copy, returning a `Map<assetId, scaledPath>` for `inputPathFor` to consult — assets not in
 *  the map are used unmodified, straight from `paths.mediaDir` as before. Confirmed a real, live
 *  cause of a hosted export crashing its own 1GB-limited container: Railway's own memory metrics
 *  showed a genuine sustained spike to the exact 1GB ceiling during a real export of a project with
 *  several image clips, right up to the crash-and-restart — and unlike a video (whose OWN resolution
 *  the export pipeline already controls via the encoder), a static image decodes at its full ORIGINAL
 *  resolution regardless of the sequence's own output size; FFmpeg's `scale=` filter only shrinks the
 *  frame AFTER that decode already happened, so a handful of full-resolution modern phone photos in
 *  one timeline is real, avoidable memory pressure that scales with clip count exactly the way this
 *  was reported (more image clips, more likely to fail) — nothing to do with clip DURATION at all.
 *
 *  Hosted-mode only, same reasoning as this route's other memory-conscious changes: desktop/local
 *  dev run on the user's own machine, with no such 1GB-class ceiling to protect, and shouldn't pay a
 *  quality cost (or the extra pre-pass time) that only matters for THIS specific deployment. */
async function prescaleOversizedImageAssets(
  project: Project,
  paths: ProjectPaths,
  scratchDir: string,
  libraryMediaDir: string | null
): Promise<Map<string, string>> {
  const overrides = new Map<string, string>();
  if (!VCUT_HOSTED) return overrides;

  for (const asset of project.assets) {
    if (asset.kind !== "image") continue;
    const sourcePath = resolveAssetInputPath(paths, libraryMediaDir, asset);
    const probe = await probeMedia(sourcePath).catch(() => null);
    if (!probe?.width || !probe.height) continue;
    if (probe.width <= MAX_HOSTED_IMAGE_DIMENSION && probe.height <= MAX_HOSTED_IMAGE_DIMENSION) continue;

    const scaledPath = path.join(scratchDir, `${asset.id}-scaled${path.extname(asset.relPath) || ".jpg"}`);
    const scaleFilter =
      probe.width >= probe.height ? `scale=${MAX_HOSTED_IMAGE_DIMENSION}:-2` : `scale=-2:${MAX_HOSTED_IMAGE_DIMENSION}`;
    const ok = await new Promise<boolean>((resolve) => {
      execFile(ffmpegBinary(), ["-y", "-i", sourcePath, "-vf", scaleFilter, scaledPath], { timeout: 30_000 }, (err) =>
        resolve(!err && fs.existsSync(scaledPath))
      );
    });
    // A failed pre-scale (a corrupt source, an unusual format ffmpeg's own decoder rejects here for
    // some reason it wouldn't during the real render) falls back to the ORIGINAL, full-resolution
    // path rather than failing the whole export over what's fundamentally an optimization — the
    // memory risk this exists to reduce is real but not worth trading a working (if heavier) export
    // for an outright failure.
    if (ok) overrides.set(asset.id, scaledPath);
  }
  return overrides;
}

/** Does everything `POST` used to do inline before returning: the Khmer pre-pass, `buildExportPlan`,
 *  spawning FFmpeg, and every step of cleanup/bookkeeping after — now running in the background
 *  against the job `POST` already registered and responded with, updating `job.phase`/`job.message`
 *  as it goes so a client watching the SSE stream sees real, specific status the whole time instead
 *  of a silent gap before FFmpeg exists to report numeric progress. */
async function runExportJob(
  job: ExportJob,
  project: Project,
  paths: ProjectPaths,
  outputPath: string,
  reqUrl: string,
  includeOutro: boolean,
  libraryMediaDir: string | null
): Promise<void> {
  const harnessBaseUrl = VCUT_HOSTED ? `http://127.0.0.1:${process.env.PORT ?? 3000}` : new URL(reqUrl).origin;

  try {
    await executeExportRender({
      project,
      paths,
      outputPath,
      harnessBaseUrl,
      includeOutro,
      libraryMediaDir,
      callbacks: {
        onPhase: (phase, message) => {
          job.phase = phase as JobPhase;
          job.message = message;
          job.notify();
        },
        onProgress: (fraction) => {
          job.progress = fraction;
          job.notify();
        },
        isCancelled: () => job.cancelRequested,
        onProcessSpawned: (proc, cancel) => {
          job.process = proc;
          job.cancel = cancel;
        },
      },
    });

    job.status = "done";
    job.progress = 1;
  } catch (err) {
    if (job.status !== "running") return;
    const code = typeof err === "object" && err && "code" in err ? (err as { code: string }).code : undefined;
    job.status = code === "cancelled" ? "cancelled" : "failed";
    if (job.status === "failed") job.error = err instanceof Error ? err.message : String(err);
  } finally {
    job.notify();
    setTimeout(() => jobs.delete(job.id), 60_000).unref?.();
  }
}

/** In hosted mode, a request naming a `jobId` directly (not `?projectId=`, which the generic gate in
 *  `localOnly.ts` already checks before any handler here runs) has nothing for that generic check to
 *  verify — there's no `projectId` in the URL for it to look at. `ExportJob` already carries its own
 *  `bpProjectId` (set at creation, from the same project the generic gate already confirmed the
 *  CREATING request owned), so re-checking ownership against THAT is enough: a `crypto.randomUUID()`
 *  job id isn't guessable, but without this, any authenticated user who obtained one anyway (a leaked
 *  URL, a browser history entry on a shared machine) could poll or cancel someone else's export. */
async function checkJobOwnership(req: Request, job: ExportJob): Promise<void> {
  if (!VCUT_HOSTED) return;
  const user = await requireSessionUser(req);
  await checkProjectOwnership(user.id, job.bpProjectId);
}

/** Looks up the currently-running job for a project, if any — `{ jobId: null }` when nothing's
 *  running. Exists so a fresh `ExportDialog` (a reloaded page, a second tab, or one that just lost
 *  its own `jobIdRef` some other way) can find and either resume watching or cancel an export that's
 *  already in flight for this project, instead of only being able to hit the 409 concurrency guard
 *  on `POST` with no way to act on it. Confirmed as a real, reported gap: hitting that 409 with a
 *  page that had never seen the job start left no way to manage it — including cancelling it — short
 *  of restarting the whole dev server. */
export const GET = localRoute(async (req) => {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  const lookupProjectId = url.searchParams.get("projectId");

  if (!jobId && lookupProjectId) {
    if (isDurableQueueActive()) {
      const active = await defaultExportJobStore.findActiveJob(lookupProjectId);
      if (active) return Response.json({ jobId: active.id });
    }
    const running = [...jobs.values()].find((j) => j.bpProjectId === lookupProjectId && j.status === "running");
    return Response.json({ jobId: running?.id ?? null });
  }

  if (!jobId) throw new ApiError(400, "Missing jobId or projectId", "missing-job-id");

  if (isDurableQueueActive()) {
    const durableJob = await defaultExportJobStore.getJob(jobId);
    if (durableJob) {
      if (VCUT_HOSTED && durableJob.userId) {
        const user = await requireSessionUser(req);
        if (durableJob.userId !== user.id) {
          await checkProjectOwnership(user.id, durableJob.projectId);
        }
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (jobState: DurableExportJob) => {
            const wireStatus =
              jobState.status === "completed"
                ? "done"
                : jobState.status === "failed"
                  ? "failed"
                  : jobState.status === "cancelled"
                    ? "cancelled"
                    : "running";
            const payload = {
              status: wireStatus,
              phase: jobState.phase,
              progress: jobState.progress,
              fileName: jobState.fileName,
              message:
                jobState.status === "queued"
                  ? "In queue... Waiting for export worker"
                  : (jobState.message ?? undefined),
              error: jobState.errorMessage ?? undefined,
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          };

          send(durableJob);
          let currentStatus = durableJob.status;
          while (currentStatus === "queued" || currentStatus === "processing") {
            await new Promise((r) => setTimeout(r, 1000));
            const fresh = await defaultExportJobStore.getJob(jobId);
            if (!fresh) break;
            currentStatus = fresh.status;
            send(fresh);
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
    }
  }

  const job = jobs.get(jobId);
  if (!job) throw new ApiError(404, "That export is no longer running", "job-missing");
  await checkJobOwnership(req, job);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = () => {
        const payload = {
          status: job.status,
          phase: job.phase,
          progress: job.progress,
          fileName: job.fileName,
          savedPath: job.savedPath,
          saveError: job.saveError,
          ...(job.message ? { message: job.message } : null),
          ...(job.error ? { error: job.error } : null),
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
      // Without this a proxy may buffer the whole stream and deliver progress only at the end.
      "X-Accel-Buffering": "no",
    },
  });
});

/** Cancels a running export. If FFmpeg has already started, kills it directly — the process must
 *  actually stop, not just stop being watched, or it would keep burning CPU and writing to the
 *  output file. Earlier than that (still in the Khmer pre-pass — `job.process` doesn't exist yet),
 *  there's no process to kill; `cancelRequested` is checked between each `await` in `runExportJob`
 *  instead, so the job still winds down at the next opportunity rather than running the whole
 *  pre-pass to completion unstoppably just because a cancel arrived before FFmpeg did. */
export const DELETE = localRoute(async (req) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new ApiError(400, "Missing jobId", "missing-job-id");

  if (isDurableQueueActive()) {
    const durableJob = await defaultExportJobStore.getJob(jobId);
    if (durableJob) {
      if (VCUT_HOSTED) {
        const user = await requireSessionUser(req);
        if (durableJob.userId && durableJob.userId !== user.id) {
          await checkProjectOwnership(user.id, durableJob.projectId);
        }
      }
      await defaultExportJobStore.requestCancel(jobId);
      return Response.json({ ok: true });
    }
  }

  const job = jobs.get(jobId);
  if (!job) throw new ApiError(404, "That export is no longer running", "job-missing");
  await checkJobOwnership(req, job);

  // TEMP diagnostic — a real, reported cancellation with no code path found that would fire a
  // DELETE here besides the dialog's own explicit "Cancel export" button (traced every writer of
  // `cancelRequested`, every client caller of `cancelExport`, the 409-recovery path, and
  // `beforeunload`; none of them do this). Logging what actually arrives is the only way to catch
  // it in the act instead of continuing to guess from a screenshot alone.
  console.error("[vcut] export: DELETE received", {
    jobId,
    phaseAtCancel: job.phase,
    progressAtCancel: job.progress,
    ua: req.headers.get("user-agent"),
    referer: req.headers.get("referer"),
  });

  if (job.status === "running") {
    job.cancelRequested = true;
    job.cancel?.();
  }
  return Response.json({ ok: true });
});

/** Reports whether export is possible at all, so the UI can explain a missing FFmpeg instead of
 *  offering a button that would fail. Finished files are served by the media/raw route with
 *  `kind=export`. */
export const HEAD = publicSessionRoute(async () => {
  const availability = ffmpegAvailable();
  // A HEAD response can't carry a body (that's the entire point of HEAD — same headers a GET would
  // send, no content) — `availability.reason` used to just get thrown away here, meaning a REAL
  // captured error message (see `ffmpegAvailable`'s own doc comment) never reached the client at
  // all, and the export dialog fell back to one hardcoded generic string regardless of the actual
  // cause. A custom header is the one place this HTTP method genuinely can carry extra detail.
  // Not entirely blank on success either — X-Ffmpeg-Available lets the client (and a curious human
  // poking this endpoint directly) tell "checked and it's fine" apart from "didn't check at all."
  const headers = new Headers({ "X-Ffmpeg-Available": String(availability.available) });
  if (availability.reason) headers.set("X-Ffmpeg-Unavailable-Reason", encodeURIComponent(availability.reason));
  return new Response(null, { status: availability.available ? 204 : 503, headers });
});
