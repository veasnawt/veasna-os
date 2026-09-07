import { execFile, spawn, type ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { buildFilmstripArgs, buildMaskImageArgs, buildMaskVideoArgs, buildThumbnailArgs, buildWaveformArgs } from "@veasnawt/vcut/src/export/ffmpegCommands";
import { readAssFontMetrics } from "@veasnawt/vcut/src/project/fonts";
import type { AssFontMetrics } from "@veasnawt/vcut/src/project/fonts";
import { ApiError } from "./paths";
import { VCUT_HOSTED } from "./auth";

/** A binary inside an `app.asar` archive can't be executed — electron-builder writes such files to a
 *  parallel `app.asar.unpacked` tree, while the package still reports the in-archive path.
 *
 *  In the current packaging setup this never actually triggers: apps/desktop ships bp (and its
 *  node_modules, ffmpeg included) via `extraResources`, which lands beside the archive rather than
 *  inside it. Kept as a cheap guard because it costs one string replace and silently covers the case
 *  where packaging changes to put the server inside the asar — the failure it prevents (spawn ENOENT
 *  on a path that looks perfectly valid) is genuinely confusing to diagnose. It's a no-op in dev and
 *  today's packaged build alike, and `resolveBinary` below falls back to the original path anyway. */
function unpackedPath(p: string): string {
  return p
    .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
    .replace("app.asar/", "app.asar.unpacked/");
}

/** TEMP diagnostic helper — a real reported recurrence of the ffmpeg-not-found bug showed this
 *  function's own earlier `os.tmpdir()`-based diagnostic file never got written ANYWHERE findable
 *  (searched the whole `C:\Users` tree and `C:\Windows\Temp`), meaning `os.tmpdir()` itself resolves
 *  to something unexpected inside Electron's `utilityProcess` sandbox — informative on its own, but
 *  not somewhere findable. `process.cwd()` is deterministic instead: `spawnNextServer.ts` sets it
 *  explicitly to `server.js`'s own directory, so this always lands at a fixed, known location next
 *  to the server itself regardless of whatever `os.tmpdir()` was doing. */
function writeDiag(kind: string, lines: string[]): void {
  try {
    fs.writeFileSync(path.join(process.cwd(), `vcut-${kind}-diag.txt`), lines.join("\n") + "\n");
  } catch {
    /* diagnostic only */
  }
}

/** `ffmpeg-static`/`ffprobe-static` compute their own exported binary path via their OWN bundled
 *  code's `__dirname` — normally rock solid, but Electron's `utilityProcess.fork()` (used to host
 *  this server in the packaged desktop app; see apps/vcut-desktop/src/server/spawnNextServer.ts)
 *  is documented to sometimes miscompute a forked script's own path context, producing a
 *  syntactically-valid path that doesn't actually exist (an `electron.asar/...`-prefixed path has
 *  been reported for exactly this pair of packages in exactly this situation elsewhere). Rather
 *  than trust that computed path outright, this independently re-derives it from the package's own
 *  root directory (`require.resolve(".../package.json")`, a plain Node builtin unaffected by
 *  whatever the PACKAGE's own bundled code does with its `__dirname`) plus the known, fixed
 *  filename convention each package uses — the same convention
 *  apps/vcut-desktop/scripts/build-resources.mjs's `ensureFfmpegBinaries` already relies on when
 *  verifying these binaries at package time. */
function fallbackBinaryPath(kind: "ffmpeg" | "ffprobe"): string | undefined {
  try {
    const pkg = kind === "ffmpeg" ? "ffmpeg-static" : "ffprobe-static";
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkgRoot = path.dirname(require.resolve(`${pkg}/package.json`));
    const isWindows = process.platform === "win32";
    return kind === "ffmpeg"
      ? path.join(pkgRoot, isWindows ? "ffmpeg.exe" : "ffmpeg")
      : path.join(pkgRoot, "bin", process.platform, process.arch, isWindows ? "ffprobe.exe" : "ffprobe");
  } catch {
    return undefined;
  }
}

/** Hosted mode's own override — confirmed a REAL, live bug (not guessed): `ffmpeg-static`'s bundled
 *  Linux binary (johnvansickle's static build) is missing `drawtext` entirely, a widely-reported
 *  upstream packaging gap where builds from FFmpeg 6.1 onward need `--enable-libharfbuzz` alongside
 *  `--enable-libfreetype` for that filter specifically, and johnvansickle's builds don't include it.
 *  The Dockerfile installs Debian bookworm's own `ffmpeg` package instead (version 5.1.3 — old enough
 *  to predate the harfbuzz requirement entirely, confirmed via Debian's own bug tracker: bookworm's
 *  stable ffmpeg was never affected by this, only a since-fixed testing/unstable snapshot was) and
 *  points these two env vars at it. Desktop/local dev never set these, so `resolveBinary` falls
 *  through to the unaffected bundled `ffmpeg-static`/`ffprobe-static` binaries exactly as before —
 *  this is additive, not a replacement, for anywhere but the hosted deployment. */
function envOverride(kind: "ffmpeg" | "ffprobe"): string | null {
  const value = process.env[kind === "ffmpeg" ? "VCUT_FFMPEG_PATH" : "VCUT_FFPROBE_PATH"];
  return value && fs.existsSync(value) ? value : null;
}

function resolveBinary(kind: "ffmpeg" | "ffprobe"): string {
  const override = envOverride(kind);
  if (override) return override;

  let raw: string | undefined;
  try {
    // Deliberately `require`, not a static `import`: a static import of a missing/postinstall-skipped
    // package fails at MODULE LOAD time (before this function's own `try/catch` even exists to catch
    // it), crashing the whole route. `require()` here throws synchronously at CALL time instead, right
    // where this `try/catch` can turn it into the clean `ApiError` below.
    if (kind === "ffmpeg") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      raw = require("ffmpeg-static") as string;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      raw = (require("ffprobe-static") as { path: string }).path;
    }
  } catch (err) {
    writeDiag(kind, [
      `require() itself threw: ${err instanceof Error ? err.stack : String(err)}`,
      `__dirname=${__dirname}`,
      `process.cwd()=${process.cwd()}`,
    ]);
    throw new ApiError(500, `${kind} is not installed. Reinstall dependencies to restore it.`, "ffmpeg-missing");
  }
  if (!raw) throw new ApiError(500, `${kind} could not be located`, "ffmpeg-missing");

  const candidate = unpackedPath(raw);
  if (fs.existsSync(candidate)) return candidate;
  if (fs.existsSync(raw)) return raw;

  // The package resolved but its OWN reported path doesn't exist — see fallbackBinaryPath's own
  // doc comment for why this happens specifically under Electron's utilityProcess, and why
  // independently re-deriving the path is the fix rather than trusting `raw` further.
  const fallback = fallbackBinaryPath(kind);
  if (fallback && fs.existsSync(fallback)) return fallback;

  // TEMP diagnostic — the first fix attempt here (fallbackBinaryPath) did NOT resolve a real,
  // reported recurrence of this bug, meaning the actual cause is still unconfirmed. This captures
  // every value this function actually saw on a real failing machine, rather than guessing again.
  writeDiag(kind, [
    `raw=${raw}`,
    `candidate(unpacked)=${candidate}`,
    `candidate exists=${fs.existsSync(candidate)}`,
    `raw exists=${fs.existsSync(raw)}`,
    `fallback=${fallback}`,
    `fallback exists=${fallback ? fs.existsSync(fallback) : "n/a"}`,
    `__dirname=${__dirname}`,
    `process.cwd()=${process.cwd()}`,
    `resourcesPath=${(process as unknown as { resourcesPath?: string }).resourcesPath}`,
    `execPath=${process.execPath}`,
  ]);

  // A clear, actionable message: this specific failure happens when the package installed but its
  // postinstall (which downloads the actual binary) was skipped — easy to hit with a strict
  // package-manager build policy, and impossible to diagnose from a bare ENOENT.
  throw new ApiError(
    500,
    `${kind} binary is missing from disk. Run "pnpm rebuild ${kind}-static" to download it.`,
    "ffmpeg-missing"
  );
}

let fontsDir: string | null = null;

/** The bundled font files live in the package's own source tree (`packages/vcut/assets/fonts`).
 *
 *  Unlike ffmpeg-static/ffprobe-static above, `@veasnawt/vcut` is listed in bp's `transpilePackages`
 *  (next.config.ts) — its source is bundled directly into the Next.js build, which means
 *  `require.resolve()` against anything inside it goes through webpack's own module system instead
 *  of returning a real filesystem path (confirmed the hard way: it resolved fine under plain `node`
 *  but 500'd with "font file is missing" under `next dev`, since webpack's `require.resolve` returns
 *  a module id, not a path). Font files aren't JS the bundler needs to see, so they're located the
 *  same way `VCUT_ROOT` is (see paths.ts): relative to `process.cwd()`, which is always
 *  studios/bp in dev/`next start`, or the packaged app's `resources/bp` (see build-resources.mjs's
 *  `ensureFontAssets`, which copies this same folder in as `vcut-fonts` alongside `server.js`). */
function resolveFontsDir(): string {
  if (!fontsDir) {
    const packaged = path.join(process.cwd(), "vcut-fonts");
    fontsDir = fs.existsSync(packaged) ? packaged : path.resolve(process.cwd(), "../../packages/vcut/assets/fonts");
  }
  return fontsDir;
}

/** Absolute path to a bundled font FILE by name — which exact file to ask for (which font family, which
 *  weight/style) is decided entirely by `@veasnawt/vcut`'s own registry (`project/fonts.ts`), via
 *  `buildExportPlan`'s `fontFileFor`; this function's only job is turning that filename into a real path
 *  on disk. The SAME files, served by the fonts route below via the browser's `@font-face` rules, are
 *  what the preview draws with — one bundled set of files, read two ways, so a text clip looks the same
 *  in the preview and the export regardless of which font is selected. */
export function textFontPath(file: string): string {
  const full = path.join(resolveFontsDir(), file);
  if (!fs.existsSync(full)) {
    throw new ApiError(500, `Bundled font file is missing: ${file}`, "font-missing");
  }
  return full;
}

/** The bundled fonts directory itself, not one file within it — what `wordHighlight` export's
 *  `subtitles=...:fontsdir=...` filter needs (libass resolves a `Style: Fontname` by scanning a whole
 *  directory for matching files, unlike `drawtext`'s `fontfile=`, which points at one exact file). Same
 *  underlying folder `textFontPath` already resolves; exposed separately since that function's job is
 *  specifically "one file's path", not "the directory". */
export function fontsDirPath(): string {
  return resolveFontsDir();
}

const fontMetricsCache = new Map<string, AssFontMetrics | null>();

/** Resolves + caches a bundled font's real ASS metrics (family name + fontsize scale) from its own
 *  file bytes — see `AssFontMetrics`'s own doc comment for what these mean and why they're needed.
 *  Cached per REGULAR-file id (not per weight/style — verified empirically that a font's own weight/
 *  style files all share one family name, and only the regular file's metrics are ever asked for here,
 *  matching `buildWordHighlightAss`'s own use of `resolveFontVariant`/`fontById` to pick the style
 *  WITHOUT needing separate metrics per face) so a project with many `wordHighlight` clips sharing one
 *  font only reads that font's bytes once per server process. */
export function fontMetricsFor(font: { id: string; files: { regular: string } }): AssFontMetrics | null {
  if (fontMetricsCache.has(font.id)) return fontMetricsCache.get(font.id)!;
  let metrics: AssFontMetrics | null;
  try {
    const buf = fs.readFileSync(path.join(resolveFontsDir(), font.files.regular));
    metrics = readAssFontMetrics(buf);
  } catch {
    metrics = null;
  }
  fontMetricsCache.set(font.id, metrics);
  return metrics;
}

let ffmpegPath: string | null = null;
let ffprobePath: string | null = null;

export function ffmpegBinary(): string {
  return (ffmpegPath ??= resolveBinary("ffmpeg"));
}

export function ffprobeBinary(): string {
  return (ffprobePath ??= resolveBinary("ffprobe"));
}

/** Whether export/import can work at all right now. The UI calls this to decide between offering
 *  export and explaining why it isn't available — never to show a button that would just fail. */
export function ffmpegAvailable(): { available: boolean; reason?: string } {
  try {
    ffmpegBinary();
    ffprobeBinary();
    return { available: true };
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export interface ProbeResult {
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

/** FFmpeg reports frame rates as exact rationals ("30000/1001" for 29.97) rather than decimals.
 *  Evaluating rather than parsing a float keeps NTSC rates accurate. */
function parseFrameRate(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const [num, den] = value.split("/").map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0 || num === 0) return undefined;
  return num / den;
}

export async function probeMedia(filePath: string): Promise<ProbeResult> {
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      ffprobeBinary(),
      ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath],
      { maxBuffer: 10 * 1024 * 1024 },
      (err, out) => (err ? reject(new ApiError(400, "That file could not be read as media", "unreadable-media")) : resolve(out))
    );
  });

  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: { codec_type?: string; width?: number; height?: number; r_frame_rate?: string; duration?: string }[];
  };

  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");

  // Container duration is the most reliable; a stream's own duration is the fallback for formats
  // that don't carry one at container level.
  const duration = Number(data.format?.duration ?? video?.duration ?? audio?.duration ?? 0);

  return {
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    width: video?.width,
    height: video?.height,
    fps: parseFrameRate(video?.r_frame_rate),
    hasAudio: Boolean(audio),
    hasVideo: Boolean(video),
  };
}

/** MediaRecorder-produced WebM (the shape `VoiceoverRecorder`'s captures always are — see the media
 *  import route's own comment) is written in STREAMING mode: the browser can't seek back to patch the
 *  container header once recording stops, so the Matroska "Segment Duration" element — and any
 *  per-stream `DURATION` tag — is simply never written at all (not even an unreliable placeholder).
 *  `probeMedia` then reads a bare `0` for `format.duration`/the per-stream fallbacks, which the import
 *  route treats as "empty file" and rejects outright — even though the recording is completely valid,
 *  playable audio. Confirmed live: piping FFmpeg's own webm mux to a non-seekable output reproduces the
 *  identical missing-duration shape a real `MediaRecorder` capture has, and this exact remux recovers
 *  it (3.008s round-trips to 3.028s — the small delta is normal Opus encoder priming/padding, not data
 *  loss).
 *
 *  The fix is a plain stream-copy remux (`-c copy`, no re-encode — fast and lossless, and format-
 *  agnostic so it isn't special-cased to WebM/Opus) into a fresh, seekable output file: FFmpeg CAN seek
 *  back on a file IT just created to patch in the correct header once it's read every packet and knows
 *  the true duration, which a browser's live encoder never gets the chance to do. Only worth attempting
 *  when the original probe already found a real stream (`hasAudio`/`hasVideo`) — a genuinely empty or
 *  corrupt file gains nothing from a remux and shouldn't cost the extra ffmpeg invocation. Returns the
 *  freshly re-probed result on success, having REPLACED `filePath`'s own on-disk content with the
 *  remuxed version — so every later consumer of this same file (export, thumbnailing, playback) also
 *  sees the fixed duration, not just this one import check — or `null` if the remux didn't actually
 *  help (a real empty/corrupt file, not a streaming-duration artifact), leaving `filePath` untouched. */
export async function remuxForDuration(filePath: string): Promise<ProbeResult | null> {
  const tmpPath = `${filePath}.remux${path.extname(filePath)}`;
  const ok = await new Promise<boolean>((resolve) => {
    execFile(ffmpegBinary(), ["-y", "-i", filePath, "-c", "copy", tmpPath], { timeout: 60_000 }, (err) => resolve(!err));
  });
  if (!ok || !fs.existsSync(tmpPath)) {
    fs.rmSync(tmpPath, { force: true });
    return null;
  }
  const reprobed = await probeMedia(tmpPath).catch(() => null);
  if (!reprobed || reprobed.duration <= 0) {
    fs.rmSync(tmpPath, { force: true });
    return null;
  }
  fs.renameSync(tmpPath, filePath);
  return reprobed;
}

/** Grabs a single frame as a JPEG for the media library. Failure is non-fatal — a missing thumbnail
 *  costs a placeholder icon, and refusing the whole import over it would be a much worse trade.
 *  Command construction itself lives in `@veasnawt/vcut`'s `ffmpegCommands.ts` — shared with the
 *  native mobile host's own FFmpeg plugin, see that module's own comment for why. */
export async function generateThumbnail(input: string, output: string, atSeconds: number): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(ffmpegBinary(), buildThumbnailArgs(input, output, atSeconds), { timeout: 30_000 }, (err) =>
      resolve(!err && fs.existsSync(output))
    );
  });
}

/** Generates ONE sprite-sheet image containing several frames evenly spaced across the source's
 *  duration, tiled left-to-right in a single row — what `TimelineClip` tiles across a clip's width
 *  for a real (if approximate) filmstrip. See `buildFilmstripArgs` for the actual filter graph and
 *  why it's shaped the way it is. */
export async function generateFilmstrip(input: string, output: string, durationSeconds: number): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(ffmpegBinary(), buildFilmstripArgs(input, output, durationSeconds), { timeout: 30_000 }, (err) =>
      resolve(!err && fs.existsSync(output))
    );
  });
}

/** Generates ONE waveform PNG spanning the source's FULL audio duration. See `buildWaveformArgs` for
 *  the actual filter graph and why it's shaped the way it is. Non-fatal on failure, same as
 *  `generateThumbnail`/`generateFilmstrip`: a missing waveform costs a flat-color clip, not a failed
 *  import. */
export async function generateWaveform(input: string, output: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(ffmpegBinary(), buildWaveformArgs(input, output), { timeout: 30_000 }, (err) =>
      resolve(!err && fs.existsSync(output))
    );
  });
}

/** Synthesizes the black/white mask video the "Remove Object" inpainting pipeline sends alongside the
 *  extracted clip. No real input file — pure `color`+`drawbox` generation — so unlike
 *  `generateThumbnail`/`generateFilmstrip` this never fails for a reason related to the SOURCE media;
 *  a `false` return here means a real ffmpeg/filter problem worth surfacing, not a routine "this file
 *  had no video stream" shrug. Still non-fatal at the call site regardless, same discipline as the
 *  other generators. */
export async function generateMaskVideo(
  output: string,
  width: number,
  height: number,
  fps: number,
  durationSeconds: number,
  rect: { x: number; y: number; width: number; height: number }
): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      ffmpegBinary(),
      buildMaskVideoArgs(output, width, height, fps, durationSeconds, rect),
      { timeout: 30_000 },
      (err) => resolve(!err && fs.existsSync(output))
    );
  });
}

/** Synthesizes a black/white mask IMAGE (not video) for the local ProPainter provider — see
 *  `buildMaskImageArgs`'s own comment for why a single still frame is sufficient here. */
export async function generateMaskImage(
  output: string,
  width: number,
  height: number,
  rect: { x: number; y: number; width: number; height: number }
): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(ffmpegBinary(), buildMaskImageArgs(output, width, height, rect), { timeout: 30_000 }, (err) =>
      resolve(!err && fs.existsSync(output))
    );
  });
}

export interface FfmpegRun {
  process: ChildProcess;
  done: Promise<void>;
  /** The ONLY correct way to cancel a run started here — killing `process` directly (as every
   *  caller's own `DELETE` handler used to) is indistinguishable, from `close`'s point of view, from
   *  the OS itself sending the exact same signal for an unrelated reason (the kernel OOM-killer sends
   *  `SIGKILL` too). Confirmed as a real, live misattribution: hosted exports killed by memory
   *  pressure were reported to users as "Export cancelled" — a normal, expected outcome nobody
   *  actually asked for — with no hint anything had gone wrong at all. Routing every intentional kill
   *  through this method instead means `close`'s signal check can tell the two apart. */
  cancel(): void;
}

/** FFmpeg's `-filter_complex_script` reads the filter graph from a FILE instead of the command line —
 *  the fix for a real, live-reproduced failure: Windows' `CreateProcess` has a hard ~32,767-character
 *  command-line limit, and a heavily keyframed clip's own filter graph (a text clip's
 *  `textStyleKeyframes`-driven chain repeats its full font path/text file path/style params once PER
 *  SLICE — see `buildKeyframedDrawTextCalls`'s own doc comment) can run well past that on its own,
 *  before any other arg is even counted. Node's `child_process.spawn` throws `ENAMETOOLONG`
 *  synchronously in that case — it never even reaches FFmpeg, so there's no stderr to diagnose it from.
 *
 *  Spilling to a script file ALWAYS, not just past some length threshold, is simpler and strictly safer
 *  than guessing a "safe enough" inline size: FFmpeg supports `-filter_complex_script` unconditionally,
 *  so there's no reason to keep the inline form as a special case for the common short-graph case. The
 *  file lives in a fresh OS-temp directory and is deleted once the process actually exits (`cleanup`,
 *  called from both the `close` and `error` paths below) — same "ephemeral, this run's only" lifetime
 *  `studios/vcut/app/api/vcut/export/route.ts`'s own text-file temp dir already uses. */
function spillFilterComplexToScript(args: string[]): { args: string[]; cleanup: () => void } {
  const index = args.indexOf("-filter_complex");
  if (index < 0 || index + 1 >= args.length) return { args, cleanup: () => {} };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vcut-filter-"));
  const scriptPath = path.join(dir, "filter_complex.txt");
  fs.writeFileSync(scriptPath, args[index + 1], "utf8");

  const next = [...args];
  next[index] = "-filter_complex_script";
  next[index + 1] = scriptPath;

  return { args: next, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// A `prlimit --as=` wrap was tried here to cap ffmpeg's memory footprint (protecting against the
// kernel OOM-killer picking Node/the whole container instead of ffmpeg — see the DELETE handlers'
// own `cancel()`-vs-signal reasoning for why that distinction matters). Reverted after a live test:
// `--as` limits VIRTUAL address space, not actual physical usage, and this ffmpeg build links dozens
// of libraries (Vulkan, CUDA, VMAF, libaom, dav1d, ...) that all get mapped into that address space
// at process startup regardless of whether a given export uses them, on top of the extra thread-stack
// space multi-threaded H.264 decoding needs — confirmed directly: even a plain, ordinary export
// failed immediately with "Error while opening decoder: Resource temporarily unavailable" (a classic
// `pthread_create` EAGAIN when address space is tight) well under any real memory pressure. Getting
// this right would need an actual physical-memory limit (a per-process cgroup, not `ulimit`/`prlimit`,
// which has no enforced RSS limit on modern Linux) — real effort, not a quick wrap; left for a future
// pass rather than shipping a "fix" that breaks ordinary exports outright.

/** Runs FFmpeg, reporting progress as a 0–1 fraction.
 *
 *  `-progress pipe:1 -nostats` makes FFmpeg emit machine-readable `key=value` lines on stdout
 *  instead of its human-oriented status line, which is far more robust than scraping the usual
 *  terminal output. */
export function runFfmpeg(args: string[], totalDuration: number, onProgress: (fraction: number) => void): FfmpegRun {
  const { args: resolvedArgs, cleanup } = spillFilterComplexToScript(args);

  // A multi-track, high-fps/high-quality encode legitimately wants every core it can get for wall-
  // clock speed — capping `-threads` would just make it slower for no real benefit. THAT reasoning
  // is specific to desktop/local: a real machine where `os.cpus().length` reflects actual usable
  // cores. In hosted mode, the container's cgroup CPU quota is often a small fraction of what
  // `os.cpus().length` reports (the host's full core count, not what THIS container is actually
  // allotted) — FFmpeg's encoder thread count defaults off that same over-reported number, and
  // spawning far more threads than the quota can schedule fails outright with `Terminating thread
  // with return code -22 (Invalid argument)` on both audio and video output streams.
  //
  // Placement matters and a first attempt at this fix got it wrong: `-threads` is positional in
  // ffmpeg's own argument parsing — placed before the FIRST `-i` (this function's original fix), it
  // becomes a DECODER thread hint for that one input, never touching the actual libx264/aac ENCODER
  // contexts that were the ones actually crashing. Confirmed directly: a real hosted export with
  // that earlier fix deployed still produced a 48-byte, effectively-empty output file — the crash
  // just stopped being reported as a hard failure while still not writing real encoded packets.
  // `resolvedArgs`'s own last element is always `options.outputPath` (buildExportPlan.ts always
  // pushes it last; `spillFilterComplexToScript` above swaps two earlier elements in place without
  // changing the array's length or tail) — inserting immediately before it lands this as an OUTPUT
  // option, in the same section as `-c:v`/`-c:a`, which is what actually caps the encoders.
  const hostedFfmpegArgs = [
    "-progress",
    "pipe:1",
    "-nostats",
    ...resolvedArgs.slice(0, -1),
    "-threads",
    "2",
    resolvedArgs[resolvedArgs.length - 1],
  ];
  const child = VCUT_HOSTED
    ? spawn(ffmpegBinary(), hostedFfmpegArgs, { windowsHide: true })
    : spawn(ffmpegBinary(), ["-progress", "pipe:1", "-nostats", ...resolvedArgs], { windowsHide: true });

  // The actual problem that showed up as "the whole computer froze" on a real desktop run is OS
  // *scheduling*, not core count: FFmpeg's threads default to the same NORMAL priority as
  // everything else, so on a machine with only a few cores they compete directly with the UI/
  // compositor for CPU time, and lose no more often than they win — which is what a system-wide
  // freeze during export actually looks like. `BELOW_NORMAL` keeps FFmpeg getting 100% of any CPU
  // time nothing else wants (so encode throughput is unaffected whenever the machine is otherwise
  // idle, which is most of an export's duration) while yielding to literally anything else — the OS
  // shell, the browser tab showing progress — the moment there's real contention. Wrapped in
  // try/catch: unsupported on some platforms/sandboxes, and a failure here is a scheduling nicety,
  // never worth failing the export itself over.
  try {
    os.setPriority(child.pid!, os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    /* best-effort — the export still runs correctly at normal priority */
  }

  let stdoutBuffer = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split("\n");
    // Keep the trailing partial line for the next chunk.
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const [key, value] = line.split("=");
      if (key?.trim() === "out_time_us" && totalDuration > 0) {
        const seconds = Number(value) / 1_000_000;
        if (Number.isFinite(seconds)) onProgress(Math.min(1, Math.max(0, seconds / totalDuration)));
      }
    }
  });

  // FFmpeg writes all of its diagnostics to stderr, so this is where a real failure explains itself.
  let stderrTail = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-4000);
  });

  // Set only by `cancel()` below — the one signal `close` can trust as "someone actually asked for
  // this." A bare `signal` truthiness check used to stand in for that (this function's original
  // logic), which conflated a real user cancel with the kernel OOM-killer's own `SIGKILL` — the exact
  // same signal a genuine cancel sends. Every caller of this file used to kill `run.process` directly
  // for that reason, which is exactly what made the two indistinguishable; routing every intentional
  // kill through `cancel()` instead is what makes this flag meaningful.
  let killedByRequest = false;

  const done = new Promise<void>((resolve, reject) => {
    child.on("error", (err) => {
      cleanup();
      reject(new ApiError(500, `Could not start FFmpeg: ${err.message}`, "ffmpeg-spawn"));
    });
    child.on("close", (code, signal) => {
      cleanup();
      if (code === 0) return resolve();
      // A cancelled export is an expected outcome, not an error to surface as a failure — but ONLY
      // when `cancel()` is what sent the signal. Any other signal-terminated exit (most plausibly the
      // OOM-killer, on hosted) is a real failure that deserves an honest message, not the same
      // "cancelled" text a deliberate user action produces.
      if (signal && killedByRequest) return reject(new ApiError(499, "Export cancelled", "cancelled"));
      if (signal) {
        reject(
          new ApiError(
            500,
            `FFmpeg was terminated unexpectedly (signal ${signal}) — this usually means it ran out of memory.`,
            "ffmpeg-killed"
          )
        );
        return;
      }
      const detail = stderrTail.trim().split("\n").slice(-4).join("\n");
      reject(new ApiError(500, `FFmpeg failed (exit ${code})${detail ? `:\n${detail}` : ""}`, "ffmpeg-failed"));
    });
  });

  return {
    process: child,
    done,
    cancel() {
      killedByRequest = true;
      child.kill("SIGKILL");
    },
  };
}
