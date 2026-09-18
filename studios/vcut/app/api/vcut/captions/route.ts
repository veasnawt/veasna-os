import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { buildAudioOnlyExportPlan } from "@veasnawt/vcut/src/export/buildAudioOnlyExportPlan";
import { trimProjectToRange } from "@veasnawt/vcut/src/export/trimForExport";
import { clipDuration, findAsset, findClip, sequenceDuration } from "@veasnawt/vcut/src/project/createProject";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import { ffmpegAvailable, ffmpegBinary, runFfmpeg } from "../_lib/ffmpeg";
import { localRoute } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs } from "../_lib/paths";
import { resolveAssetInputPath } from "../_lib/assetInput";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One span of the timeline to transcribe — the whole sequence is a single `CaptionRange`, a per-clip
 *  or multi-clip-selection job is one range per selected clip (see `POST`'s own doc comment for how
 *  several of these get combined into one extraction pass). Imported directly by
 *  `captions/transcribe/route.ts`, which passes these straight through unchanged. */
export interface CaptionRange {
  start: number;
  end: number;
}

/** Auto Captions now runs in two passes across two routes, for the same reason Remove Object does (see
 *  `inpaint/route.ts`'s own extract/`inpaint/predict`-style split): this route does the part that can
 *  ONLY run on the machine that actually has the project's real media files — reading the project,
 *  extracting each range's audio via ffmpeg, concatenating them into one file. It genuinely CANNOT run
 *  on vcut.io's own server for a desktop user's project, so it stays local-only (`localRoute`, no
 *  CORS) exactly like every other file-touching route here.
 *
 *  It does NOT transcribe anything — no secret key, no VAD, no chunking. `captions/transcribe/route.ts`
 *  (CORS-enabled, desktop calls it on the live vcut.io deployment) takes this route's own output
 *  (`audioBase64` + `ranges`/`durations`) and does the rest: VAD-based silence detection, Replicate/Kiri
 *  transcription, and chunking into final caption clips. Splitting it this way means the only thing
 *  crossing the network is a small extracted-audio file, never the user's real source video.
 *
 *  Synchronous, not a job+SSE flow like the old single-route version was — extraction is fast (a few
 *  seconds even for a long sequence), unlike the transcription step this route no longer does. */
export const POST = localRoute(async (req) => {
  const bpProjectId = new URL(req.url).searchParams.get("projectId");
  if (!bpProjectId) throw new ApiError(400, "Missing projectId", "missing-project-id");

  const availability = ffmpegAvailable();
  if (!availability.available) throw new ApiError(500, availability.reason ?? "FFmpeg is unavailable", "ffmpeg-missing");

  const body = (await req.json().catch(() => ({}))) as { clipIds?: string[] };

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

  // Unlike the old single-route version, this route is now reached ONLY in local/desktop mode
  // (`captions/transcribe/route.ts` is what a hosted caller — including desktop calling OUT to it —
  // reaches instead), so there is no `VCUT_HOSTED && user`-owned account-wide library to resolve
  // against here anymore — every asset lives under this project's own `mediaDir`.
  const libraryMediaDir = null;

  const jobId = crypto.randomUUID();
  const audioPath = path.join(paths.scratchDir, `${jobId}-audio.mp3`);
  const partPaths: string[] = [];
  const concatListPath = path.join(paths.scratchDir, `${jobId}-concat.txt`);

  try {
    const durations: number[] = [];
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      const trimmed = trimProjectToRange(project, range.start, range.end);
      const partPath = ranges.length === 1 ? audioPath : path.join(paths.scratchDir, `${jobId}-audio-part${i}.mp3`);
      partPaths.push(partPath);
      const plan = buildAudioOnlyExportPlan(trimmed, {
        inputPathFor: (assetId) => {
          const asset = findAsset(trimmed, assetId);
          if (!asset) throw new ApiError(400, "A clip references media that is no longer in the project", "missing-asset");
          return resolveAssetInputPath(paths, libraryMediaDir, asset);
        },
        outputPath: partPath,
      });
      durations.push(plan.duration);
      const extractRun = runFfmpeg(plan.args, plan.duration, () => {});
      await extractRun.done;
    }

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
    }

    const audioBase64 = fs.readFileSync(audioPath).toString("base64");
    return Response.json({ audioBase64, ranges, durations });
  } finally {
    fs.rm(audioPath, { force: true }, () => {});
    for (const p of partPaths) if (p !== audioPath) fs.rm(p, { force: true }, () => {});
    fs.rm(concatListPath, { force: true }, () => {});
  }
});

/** Reports whether THIS MACHINE can do the local extraction half at all (FFmpeg present) — the remote
 *  half's own availability (`captions/transcribe/route.ts`'s HEAD) is a separate check now; `client.ts`'s
 *  `captionsAvailable()` combines both. */
export const HEAD = localRoute(async () => {
  return new Response(null, { status: ffmpegAvailable().available ? 204 : 503 });
});
