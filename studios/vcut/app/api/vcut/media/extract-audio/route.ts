import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { Asset } from "@veasnawt/vcut/src/project/types";
import { resolveAssetInputPath } from "../../_lib/assetInput";
import { requireSessionUser, VCUT_HOSTED } from "../../_lib/auth";
import { ffmpegBinary } from "../../_lib/ffmpeg";
import { importMediaBytes } from "../../_lib/importMedia";
import { localRoute } from "../../_lib/localOnly";
import { ApiError, ensureProjectDirs, ensureUserMediaDirs, userMediaPaths } from "../../_lib/paths";
import { getProfile } from "../../_lib/profiles";
import { checkStorageQuota, insertUserMedia } from "../../_lib/userMedia";

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
 *  So this encodes a genuinely independent AAC/m4a copy of ONLY the source's audio stream and imports
 *  it exactly like an upload of that file (`importMediaBytes`: probe, waveform) — on the hosted deploy
 *  into the user's own library, quota-checked, the same as `media/route.ts`'s own upload path — and
 *  hands back that normal `Asset`; the client swaps the extracted clip over to it once it resolves.
 *
 *  The source is resolved through the shared `resolveAssetInputPath`, not the project's own media
 *  folder alone. It used to be the latter, which failed for every video uploaded on the hosted deploy —
 *  those live in the user's LIBRARY — and the client dropped that failure silently, so the extracted
 *  clip never became audio (found in production: both extracted clips still pointing at a video were
 *  library-backed; the one that had upgraded predated the library). */
export const POST = localRoute(async (req) => {
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) throw new ApiError(400, "Missing projectId", "missing-project-id");
  const paths = ensureProjectDirs(projectId);

  const body = (await req.json().catch(() => ({}))) as Partial<Pick<Asset, "relPath" | "name" | "libraryMediaId" | "bundledSfx">>;
  if (!body.relPath) throw new ApiError(400, "Missing relPath", "missing-rel-path");
  const user = VCUT_HOSTED ? await requireSessionUser(req) : null;
  const sourcePath = resolveAssetInputPath(paths, user ? userMediaPaths(user.id).mediaDir : null, {
    relPath: body.relPath,
    libraryMediaId: body.libraryMediaId,
    bundledSfx: body.bundledSfx,
  });
  if (!fs.existsSync(sourcePath)) throw new ApiError(404, "That media file no longer exists", "source-missing");

  const baseName = (body.name || "Audio").replace(/\.[^./\\]+$/, "");
  const scratchPath = path.join(os.tmpdir(), `vcut-extract-${crypto.randomUUID()}.m4a`);
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        ffmpegBinary(),
        // `-vn`: drop the video stream entirely. Always re-encoded to AAC (never `-c:a copy`) — the
        // source's own audio codec varies too widely (Opus in a WebM recording, PCM in some MOVs, ...)
        // for a stream copy to reliably land in an `.m4a` container that plays back everywhere the rest
        // of this app's own audio assets already do.
        ["-y", "-i", sourcePath, "-vn", "-c:a", "aac", "-b:a", "192k", scratchPath],
        { timeout: 120_000 },
        (err) => (err ? reject(new ApiError(500, "Could not extract audio from that clip", "extract-failed")) : resolve())
      );
    });
    if (!fs.existsSync(scratchPath)) throw new ApiError(500, "Could not extract audio from that clip", "extract-failed");
    const bytes = fs.readFileSync(scratchPath);
    const fileName = `${baseName} (Audio).m4a`;

    if (user) {
      const profile = await getProfile(user.id);
      await checkStorageQuota(user.id, profile?.plan ?? "free", bytes.byteLength);
      const asset = await importMediaBytes(ensureUserMediaDirs(user.id), bytes, fileName);
      if (asset.kind !== "audio") throw new ApiError(500, "Unexpected asset kind from extracted audio", "unexpected-asset-kind");
      asset.name = `${baseName} (Audio)`;
      await insertUserMedia(user.id, {
        id: asset.id,
        kind: asset.kind,
        name: asset.name,
        relPath: asset.relPath,
        thumbnailRelPath: asset.thumbnailRelPath ?? null,
        filmstripRelPath: asset.filmstripRelPath ?? null,
        waveformRelPath: asset.waveformRelPath ?? null,
        duration: asset.duration,
        width: asset.width ?? null,
        height: asset.height ?? null,
        fps: asset.fps ?? null,
        hasAudio: asset.hasAudio,
        sizeBytes: asset.sizeBytes,
        aiGeneration: null,
        // A real file the user made, like an upload — so it belongs in "All my media" too.
        hidden: false,
      });
      asset.libraryMediaId = asset.id;
      return Response.json({ asset });
    }

    const asset = await importMediaBytes(paths, bytes, fileName);
    asset.name = `${baseName} (Audio)`;
    return Response.json({ asset });
  } finally {
    fs.rmSync(scratchPath, { force: true });
  }
});
