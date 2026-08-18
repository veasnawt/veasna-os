import { execFile, spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { buildFilmstripArgs, buildMaskImageArgs, buildMaskVideoArgs, buildThumbnailArgs, buildWaveformArgs } from "@veasna/vstudio/src/export/ffmpegCommands";
import { ApiError } from "./paths";

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

function resolveBinary(kind: "ffmpeg" | "ffprobe"): string {
  let raw: string | undefined;
  try {
    if (kind === "ffmpeg") {
      raw = require("ffmpeg-static") as string;
    } else {
      raw = (require("ffprobe-static") as { path: string }).path;
    }
  } catch {
    throw new ApiError(500, `${kind} is not installed. Reinstall dependencies to restore it.`, "ffmpeg-missing");
  }
  if (!raw) throw new ApiError(500, `${kind} could not be located`, "ffmpeg-missing");

  const candidate = unpackedPath(raw);
  if (fs.existsSync(candidate)) return candidate;
  if (fs.existsSync(raw)) return raw;
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

/** The bundled font files live in the package's own source tree (`packages/vstudio/assets/fonts`).
 *
 *  Unlike ffmpeg-static/ffprobe-static above, `@veasna/vstudio` is listed in bp's `transpilePackages`
 *  (next.config.ts) — its source is bundled directly into the Next.js build, which means
 *  `require.resolve()` against anything inside it goes through webpack's own module system instead
 *  of returning a real filesystem path (confirmed the hard way: it resolved fine under plain `node`
 *  but 500'd with "font file is missing" under `next dev`, since webpack's `require.resolve` returns
 *  a module id, not a path). Font files aren't JS the bundler needs to see, so they're located the
 *  same way `VSTUDIO_ROOT` is (see paths.ts): relative to `process.cwd()`, which is always
 *  studios/bp in dev/`next start`, or the packaged app's `resources/bp` (see build-resources.mjs's
 *  `ensureFontAssets`, which copies this same folder in as `vstudio-fonts` alongside `server.js`). */
function resolveFontsDir(): string {
  if (!fontsDir) {
    const packaged = path.join(process.cwd(), "vstudio-fonts");
    fontsDir = fs.existsSync(packaged) ? packaged : path.resolve(process.cwd(), "../../packages/vstudio/assets/fonts");
  }
  return fontsDir;
}

/** Absolute path to a bundled font FILE by name — which exact file to ask for (which font family, which
 *  weight/style) is decided entirely by `@veasna/vstudio`'s own registry (`project/fonts.ts`), via
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

/** Grabs a single frame as a JPEG for the media library. Failure is non-fatal — a missing thumbnail
 *  costs a placeholder icon, and refusing the whole import over it would be a much worse trade.
 *  Command construction itself lives in `@veasna/vstudio`'s `ffmpegCommands.ts` — shared with the
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
}

/** Runs FFmpeg, reporting progress as a 0–1 fraction.
 *
 *  `-progress pipe:1 -nostats` makes FFmpeg emit machine-readable `key=value` lines on stdout
 *  instead of its human-oriented status line, which is far more robust than scraping the usual
 *  terminal output. */
export function runFfmpeg(args: string[], totalDuration: number, onProgress: (fraction: number) => void): FfmpegRun {
  const child = spawn(ffmpegBinary(), ["-progress", "pipe:1", "-nostats", ...args], {
    windowsHide: true,
  });

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

  const done = new Promise<void>((resolve, reject) => {
    child.on("error", (err) => reject(new ApiError(500, `Could not start FFmpeg: ${err.message}`, "ffmpeg-spawn")));
    child.on("close", (code, signal) => {
      if (code === 0) return resolve();
      // A cancelled export is an expected outcome, not an error to surface as a failure.
      if (signal) return reject(new ApiError(499, "Export cancelled", "cancelled"));
      const detail = stderrTail.trim().split("\n").slice(-4).join("\n");
      reject(new ApiError(500, `FFmpeg failed (exit ${code})${detail ? `:\n${detail}` : ""}`, "ffmpeg-failed"));
    });
  });

  return { process: child, done };
}
