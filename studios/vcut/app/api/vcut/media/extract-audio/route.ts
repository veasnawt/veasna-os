import { execFile } from "child_process";
import fs from "fs";
import type { Asset } from "@veasnawt/vcut/src/project/types";
import { ffmpegBinary, generateWaveform, probeMedia } from "../../_lib/ffmpeg";
import { localRoute } from "../../_lib/localOnly";
import { ApiError, ensureProjectDirs, resolveWithin, uniqueFileName } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Extracts just the audio stream out of an already-imported video (or any other) asset's file into a
 *  genuinely NEW, independent audio file — backing `ExtractAudioCommand`'s "Detach Audio" tool
 *  (`VCutApp.tsx`'s Extract Audio button). That command itself runs entirely client-side and DOESN'T
 *  call this route: it reuses the original clip's own `assetId` directly, since audio playback/export
 *  only ever cares about `track.kind`, never the referenced asset's own "video"/"audio" kind (see its
 *  own doc comment) — no server round-trip needed for the audio to actually WORK.
 *
 *  What that fast path can't give is a correct-looking LIBRARY ENTRY: sharing the video asset's id
 *  means the "extracted" clip still shows the video's own filename and film-strip thumbnail (confirmed
 *  a real, reported "why does the extracted audio look like the mp4" confusion) — `waveformRelPath` is
 *  only ever generated for a genuinely audio-KIND asset (`media/route.ts`'s own import pipeline), and
 *  two Asset records simply can't safely share one `relPath` in this codebase: asset deletion unlinks
 *  its own file unconditionally, with no reference count across OTHER assets that might point at the
 *  same path, so a shared file would risk one asset's delete breaking the other's still-in-use clip.
 *
 *  So this exists as an optional, separate step: probe the source, encode a genuinely independent
 *  AAC/m4a copy of ONLY its audio stream, generate a real waveform for it, and hand back a normal,
 *  freshly-"imported"-shaped `Asset` — the client swaps the extracted clip over to reference THIS asset
 *  once it resolves, same "land the real result once ready" precedent `VoiceoverRecorder`'s own async
 *  finalize step already sets. A slower, better-looking upgrade path, not a correctness requirement. */
export const POST = localRoute(async (req) => {
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) throw new ApiError(400, "Missing projectId", "missing-project-id");
  const paths = ensureProjectDirs(projectId);

  const body = (await req.json().catch(() => ({}))) as { relPath?: string; name?: string };
  if (!body.relPath) throw new ApiError(400, "Missing relPath", "missing-rel-path");
  const sourcePath = resolveWithin(paths.mediaDir, body.relPath);
  if (!fs.existsSync(sourcePath)) throw new ApiError(404, "That media file no longer exists", "source-missing");

  const baseName = (body.name || "Audio").replace(/\.[^./\\]+$/, "");
  const fileName = uniqueFileName(`${baseName}.m4a`);
  const destination = resolveWithin(paths.mediaDir, fileName);

  await new Promise<void>((resolve, reject) => {
    execFile(
      ffmpegBinary(),
      // `-vn`: drop the video stream entirely. Always re-encoded to AAC (never `-c:a copy`) — the
      // source's own audio codec varies too widely (Opus in a WebM recording, PCM in some MOVs, ...)
      // for a stream copy to reliably land in an `.m4a` container that plays back everywhere the rest
      // of this app's own audio assets already do.
      ["-y", "-i", sourcePath, "-vn", "-c:a", "aac", "-b:a", "192k", destination],
      { timeout: 120_000 },
      (err) => (err ? reject(new ApiError(500, "Could not extract audio from that clip", "extract-failed")) : resolve())
    );
  });
  if (!fs.existsSync(destination)) throw new ApiError(500, "Could not extract audio from that clip", "extract-failed");

  let probe;
  try {
    probe = await probeMedia(destination);
  } catch (err) {
    fs.rmSync(destination, { force: true });
    throw err;
  }

  const asset: Asset = {
    id: `a_${crypto.randomUUID().slice(0, 8)}`,
    kind: "audio",
    name: `${baseName} (Audio)`,
    relPath: fileName,
    duration: probe.duration,
    hasAudio: probe.hasAudio,
    sizeBytes: fs.statSync(destination).size,
    importedAt: Date.now(),
  };

  const waveformName = `${asset.id}-waveform.png`;
  if (await generateWaveform(destination, resolveWithin(paths.thumbnailsDir, waveformName))) {
    asset.waveformRelPath = waveformName;
  }

  return Response.json({ asset });
});
