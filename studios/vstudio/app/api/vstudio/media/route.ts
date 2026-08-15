import fs from "fs";
import path from "path";
import type { Asset } from "@veasna/vstudio/src/project/types";
import { generateFilmstrip, generateThumbnail, generateWaveform, probeMedia } from "../_lib/ffmpeg";
import { localRoute } from "../_lib/localOnly";
import { kindForExtension, SUPPORTED_EXTENSIONS } from "../_lib/mediaFormats";
import { ApiError, ensureProjectDirs, resolveWithin, uniqueFileName } from "../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function projectIdOf(req: Request): string {
  const id = new URL(req.url).searchParams.get("projectId");
  if (!id) throw new ApiError(400, "Missing projectId", "missing-project-id");
  return id;
}

/** Imports a file into the project.
 *
 *  The file is COPIED into the project's own media folder rather than referenced where it sits. That
 *  costs disk space, but it buys three things that matter more here: the original is never at risk of
 *  being modified, FFmpeg always has a stable path that doesn't break when the user moves their
 *  Downloads folder around, and this works identically in a plain browser tab (where the web File API
 *  deliberately hides real paths) and in the packaged desktop app. */
export const POST = localRoute(async (req) => {
  const bpProjectId = projectIdOf(req);
  const paths = ensureProjectDirs(bpProjectId);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "No file was uploaded", "no-file");

  const ext = path.extname(file.name).toLowerCase();
  const kind = kindForExtension(ext);
  if (!kind) {
    throw new ApiError(
      400,
      `VStudio can't import "${ext || file.name}". Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`,
      "unsupported-format"
    );
  }

  const fileName = uniqueFileName(file.name);
  const destination = resolveWithin(paths.mediaDir, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(destination, bytes);

  let probe;
  try {
    probe = await probeMedia(destination);
  } catch (err) {
    // Don't leave an unreadable file sitting in the project folder if it turned out not to be media.
    fs.rmSync(destination, { force: true });
    throw err;
  }

  // A still image has no duration and no video stream in the usual sense; everything else must have
  // real content to be worth putting on a timeline.
  if (kind !== "image" && probe.duration <= 0) {
    fs.rmSync(destination, { force: true });
    throw new ApiError(400, "That file contains no playable audio or video", "empty-media");
  }

  // A "video" EXTENSION (.webm, .mkv, .mov, ...) doesn't guarantee an actual video STREAM — a
  // MediaRecorder-captured voiceover, for instance, is commonly a .webm container holding only Opus
  // audio (confirmed live: VoiceoverRecorder's recordings were landing on video tracks with no visible
  // reason why, until this). The extension is only a first guess; the probe is authoritative, so a
  // video-extension file that actually has no video stream gets reclassified as audio here, rather
  // than being stuck as a "video" asset that can only ever go on a track it has nothing to show on.
  const resolvedKind = kind === "video" && !probe.hasVideo && probe.hasAudio ? "audio" : kind;

  const asset: Asset = {
    id: `a_${crypto.randomUUID().slice(0, 8)}`,
    kind: resolvedKind,
    name: file.name,
    relPath: fileName,
    duration: probe.duration,
    hasAudio: probe.hasAudio,
    sizeBytes: bytes.byteLength,
    importedAt: Date.now(),
    ...(probe.width ? { width: probe.width } : null),
    ...(probe.height ? { height: probe.height } : null),
    ...(probe.fps ? { fps: probe.fps } : null),
  };

  if (resolvedKind === "video") {
    const thumbName = `${asset.id}.jpg`;
    // One second in, rather than frame zero — the first frame of a real clip is very often black.
    const at = Math.min(1, probe.duration / 2);
    if (await generateThumbnail(destination, resolveWithin(paths.thumbnailsDir, thumbName), at)) {
      asset.thumbnailRelPath = thumbName;
    }
    // A SEPARATE sprite sheet for the Timeline's own filmstrip tiling — see `generateFilmstrip`'s own
    // comment for why one wider sprite image, not several separate files or a data-model list, is what
    // lets the frontend reuse its existing single-image tiling CSS unchanged.
    const filmstripName = `${asset.id}-filmstrip.jpg`;
    if (await generateFilmstrip(destination, resolveWithin(paths.thumbnailsDir, filmstripName), probe.duration)) {
      asset.filmstripRelPath = filmstripName;
    }
  }
  if (resolvedKind === "audio") {
    const waveformName = `${asset.id}-waveform.png`;
    if (await generateWaveform(destination, resolveWithin(paths.thumbnailsDir, waveformName))) {
      asset.waveformRelPath = waveformName;
    }
  }
  // An image needs no separate thumbnail — it IS its own preview, and the library renders it
  // straight from the media folder. Deliberately NOT pointed at via a "../media/..." thumbnail path:
  // that would have to escape the thumbnails directory, which `resolveWithin` refuses on purpose.

  return Response.json({ asset });
});

/** Removes an imported file from the project folder. Only ever touches VStudio's own copy inside
 *  `.vstudio/<project>/media` — the user's original file is never a candidate for deletion. */
export const DELETE = localRoute(async (req) => {
  const bpProjectId = projectIdOf(req);
  const paths = ensureProjectDirs(bpProjectId);

  const relPath = new URL(req.url).searchParams.get("relPath");
  const thumbnailRelPath = new URL(req.url).searchParams.get("thumbnailRelPath");
  const waveformRelPath = new URL(req.url).searchParams.get("waveformRelPath");
  // `null` means the param was never sent at all — a real caller error. An empty string is a valid,
  // different case: a text asset's `relPath` is always `""` (see project/types.ts — it has no
  // backing file to begin with), so removing one legitimately means "nothing to unlink on disk",
  // not an error.
  if (relPath === null) throw new ApiError(400, "Missing relPath", "missing-rel-path");

  if (relPath) fs.rmSync(resolveWithin(paths.mediaDir, relPath), { force: true });
  // Images point their thumbnail back at the media file itself, which the line above already removed.
  if (thumbnailRelPath && !thumbnailRelPath.startsWith("..")) {
    fs.rmSync(resolveWithin(paths.thumbnailsDir, thumbnailRelPath), { force: true });
  }
  if (waveformRelPath && !waveformRelPath.startsWith("..")) {
    fs.rmSync(resolveWithin(paths.thumbnailsDir, waveformRelPath), { force: true });
  }

  return Response.json({ ok: true });
});
