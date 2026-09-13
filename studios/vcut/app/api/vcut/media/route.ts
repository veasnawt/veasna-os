import fs from "fs";
import path from "path";
import { requireSessionUser, VCUT_HOSTED } from "../_lib/auth";
import { importMediaBytes } from "../_lib/importMedia";
import { localRoute } from "../_lib/localOnly";
import { kindForExtension, SUPPORTED_EXTENSIONS } from "../_lib/mediaFormats";
import { ApiError, ensureProjectDirs, ensureUserMediaDirs, resolveWithin } from "../_lib/paths";
import { getProfile } from "../_lib/profiles";
import { checkStorageQuota, insertUserMedia } from "../_lib/userMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function projectIdOf(req: Request): string {
  const id = new URL(req.url).searchParams.get("projectId");
  if (!id) throw new ApiError(400, "Missing projectId", "missing-project-id");
  return id;
}

/** Imports a file — into the current user's own account-wide media library in hosted mode (reusable
 *  from every OTHER project too, not just this one — see `user_media`'s own migration comment for the
 *  full reasoning), or into this project's own folder exactly as before on local/desktop, where
 *  there's no "account" for a library to belong to at all.
 *
 *  Either way the file is COPIED rather than referenced where it sits. That costs disk space, but it
 *  buys three things that matter more here: the original is never at risk of being modified, FFmpeg
 *  always has a stable path that doesn't break when the user moves their Downloads folder around, and
 *  this works identically in a plain browser tab (where the web File API deliberately hides real
 *  paths) and in the packaged desktop app. */
export const POST = localRoute(async (req) => {
  const bpProjectId = projectIdOf(req);
  const paths = ensureProjectDirs(bpProjectId);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "No file was uploaded", "no-file");

  // Pre-checked here (not just left to `importMediaBytes`'s own generic rejection) so this route keeps
  // its own more helpful "Supported: ..." message — the only piece of the old inline pipeline still
  // duplicated, deliberately: it's a one-line classification check, not the whole write/probe/thumbnail
  // sequence `importMediaBytes` now owns.
  const ext = path.extname(file.name).toLowerCase();
  if (!kindForExtension(ext)) {
    throw new ApiError(
      400,
      `VCut can't import "${ext || file.name}". Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`,
      "unsupported-format"
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  if (VCUT_HOSTED) {
    const user = await requireSessionUser(req);
    const profile = await getProfile(user.id);
    // Checked BEFORE writing anything — same "validate first, spend/write second" order every other
    // gated action in this app already follows (`hostedCreditGatedRoute`'s own `spend()` callback).
    await checkStorageQuota(user.id, profile?.plan ?? "free", bytes.byteLength);

    const libraryPaths = ensureUserMediaDirs(user.id);
    const asset = await importMediaBytes(libraryPaths, bytes, file.name);
    // importMediaBytes only ever classifies a real file upload as one of these three — never
    // "text"/"color" (those are authored directly, never imported) — but Asset.kind's own declared
    // type is the full AssetKind union, so this is a genuine runtime check, not a formality.
    if (asset.kind !== "video" && asset.kind !== "audio" && asset.kind !== "image") {
      throw new ApiError(500, "Unexpected asset kind from import", "unexpected-asset-kind");
    }
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
    });
    // Marks this Asset as library-backed for every other consumer (media/raw's own file resolution,
    // MediaLibrary's own "remove from project vs. delete from library" distinction) — see
    // `Asset.libraryMediaId`'s own doc comment.
    asset.libraryMediaId = asset.id;
    return Response.json({ asset });
  }

  const asset = await importMediaBytes(paths, bytes, file.name);
  return Response.json({ asset });
});

/** Removes an imported file from the project folder. Only ever touches VCut's own copy inside
 *  `.vcut/<project>/media` — the user's original file is never a candidate for deletion.
 *
 *  Never called at all for a library-backed asset (`Asset.libraryMediaId` set) — the CLIENT skips
 *  this route entirely for those (see `editorStore.ts`'s own `removeAsset`), since "remove from this
 *  project" and "delete from my library" are now two genuinely different actions once a file can be
 *  shared across projects: this route only ever meant the latter, which is exactly wrong for a
 *  library asset that might still be in use elsewhere (`DELETE /api/vcut/media/library` is the real
 *  library-delete path, with its own cross-project usage warning). */
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
