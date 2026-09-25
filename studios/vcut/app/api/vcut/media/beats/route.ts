import { execFile } from "child_process";
import fs from "fs";
import { detectBeats, toMonoDownsampled } from "@veasnawt/vcut/src/audio/beatDetection";
import { requireSessionUser, VCUT_HOSTED } from "../../_lib/auth";
import { ffmpegBinary } from "../../_lib/ffmpeg";
import { localRoute } from "../../_lib/localOnly";
import { ApiError, projectPaths, resolveWithin, userMediaPaths } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Longest audio analysed, seconds. */
const MAX_SECONDS = 15 * 60;
/** Decoded at this rate (mono): plenty for beat finding, and a 15-minute song stays about 40 MB. */
const ANALYSIS_RATE = 11025;

function decodeToFloat32(source: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegBinary(),
      ["-v", "error", "-i", source, "-vn", "-t", String(MAX_SECONDS), "-ac", "1", "-ar", String(ANALYSIS_RATE), "-f", "f32le", "pipe:1"],
      { encoding: "buffer", maxBuffer: 1024 * 1024 * 128, timeout: 110_000 },
      (err, stdout) => {
        const bytes = stdout as unknown as Buffer;
        if (err || !bytes || bytes.length < 4) return reject(new ApiError(422, "This file has no audio to listen to", "no-audio"));
        const copy = new Uint8Array(bytes).buffer;
        resolve(new Float32Array(copy, 0, Math.floor(copy.byteLength / 4)));
      }
    );
  });
}

/** `POST /api/vcut/media/beats?projectId=...` `{ relPath, library? }` — finds the tempo and beats of an audio (or video-with-sound)
 *  file. Decoded here with FFmpeg rather than in the browser: Safari's `decodeAudioData` refuses many perfectly playable files
 *  ("Decoding failed"), and FFmpeg reads everything the app can import. Returns `{ bpm, confidence, beats }`. */
export const POST = localRoute(async (req) => {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const body = (await req.json().catch(() => null)) as { relPath?: unknown; library?: unknown } | null;
  const relPath = typeof body?.relPath === "string" ? body.relPath : "";
  const isLibrary = body?.library === true;
  if (!relPath || (!projectId && !isLibrary)) throw new ApiError(400, "Missing projectId or relPath", "missing-params");

  let mediaDir: string;
  if (isLibrary) {
    if (!VCUT_HOSTED) throw new ApiError(400, "Library media isn't available here", "library-unavailable");
    mediaDir = userMediaPaths((await requireSessionUser(req)).id).mediaDir;
  } else {
    mediaDir = projectPaths(projectId!).mediaDir;
  }
  const source = resolveWithin(mediaDir, relPath);
  if (!fs.existsSync(source)) throw new ApiError(404, "Media file is missing", "media-offline");

  const decoded = await decodeToFloat32(source);
  const { samples, sampleRate } = toMonoDownsampled([decoded], ANALYSIS_RATE, ANALYSIS_RATE);
  const result = detectBeats(samples, sampleRate);
  if (result.beats.length < 4) throw new ApiError(422, "No clear beat found in this audio", "no-beat");
  return Response.json(result);
});
