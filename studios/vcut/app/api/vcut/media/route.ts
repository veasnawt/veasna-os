import fs from "fs";
import path from "path";
import { requireSessionUser, VCUT_HOSTED } from "../_lib/auth";
import { importMediaBytes } from "../_lib/importMedia";
import { localRoute } from "../_lib/localOnly";
import { kindForExtension, SUPPORTED_EXTENSIONS } from "../_lib/mediaFormats";
import { ApiError, ensureProjectDirs, ensureUserMediaDirs, resolveWithin } from "../_lib/paths";
import { getProfile } from "../_lib/profiles";
import { checkStorageQuota, insertUserMedia, STORAGE_CAP_BYTES } from "../_lib/userMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nothing can legitimately need more than this in one upload — the Pro plan's own entire storage
 *  budget (`STORAGE_CAP_BYTES.pro`) is 10GB, so a single file bigger than that could never fit under
 *  any plan regardless of how much room is left. Checked against `Content-Length` before the request
 *  body is parsed at all, so an absurdly oversized upload never gets buffered into memory in the
 *  first place — `req.formData()` fully buffers the whole multipart body with no cap of its own, and
 *  this route then makes a SECOND full copy via `arrayBuffer()`. Applies in both hosted and local
 *  mode: the same unbounded-memory risk exists either way (Node buffers regardless of `VCUT_HOSTED`),
 *  it just costs the single shared hosted container instead of only the one user's own machine. Not
 *  airtight (a client that omits or lies about `Content-Length` slips past this one check — same
 *  acknowledged limitation `_lib/importMedia.ts`'s own `downloadMediaUrl` already accepts), but real
 *  and free. */
const MAX_UPLOAD_BYTES = STORAGE_CAP_BYTES.pro;

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

  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    throw new ApiError(
      413,
      `That file is too large to import (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024 * 1024))}GB)`,
      "upload-too-large"
    );
  }

  // Session + plan resolved BEFORE the body is parsed (a couple of cheap network calls, not memory
  // work) specifically so the quota check below can run against the declared `Content-Length` before
  // `req.formData()`/`arrayBuffer()` buffer anything — the common "this user is simply out of room"
  // rejection then costs nothing beyond the header check, instead of two full in-memory copies of a
  // file that was always going to be rejected. Re-checked again below with the REAL byte count once
  // parsed (`Content-Length` can be absent for a chunked request, or in principle wrong) — this
  // up-front check only tries to short-circuit the common case, it's never the only guard.
  const hostedUser = VCUT_HOSTED ? await requireSessionUser(req) : null;
  const hostedPlan = hostedUser ? ((await getProfile(hostedUser.id))?.plan ?? "free") : null;
  if (hostedUser && hostedPlan && Number.isFinite(declaredLength)) {
    await checkStorageQuota(hostedUser.id, hostedPlan, declaredLength);
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "No file was uploaded", "no-file");
  // Set only for a stock sound effect or voiceover take (`client.ts`'s own `importMedia` — see its doc
  // comment) — a plain user upload never sends this, so it always lands in "All my media" like any
  // other import. See `UserMediaRow.hidden`'s own doc comment for why this needs to be a SEPARATE
  // server-side flag rather than reusing `Asset.hiddenFromLibrary` further down the pipeline: by the
  // time an asset reaches `insertUserMedia`, there's no field on it left to read that intent back off
  // of (`hiddenFromLibrary` is stamped onto the returned asset CLIENT-side, after this response).
  const hidden = form.get("hidden") === "1";

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

  if (hostedUser && hostedPlan) {
    // Checked BEFORE writing anything — same "validate first, spend/write second" order every other
    // gated action in this app already follows (`hostedCreditGatedRoute`'s own `spend()` callback).
    // The authoritative check (real byte count), regardless of whether the pre-check above already
    // ran against `Content-Length`.
    await checkStorageQuota(hostedUser.id, hostedPlan, bytes.byteLength);
    const user = hostedUser;

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
      hidden,
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
  const proxyRelPath = new URL(req.url).searchParams.get("proxyRelPath");
  // `null` means the param was never sent at all — a real caller error. An empty string is a valid,
  // different case: a text asset's `relPath` is always `""` (see project/types.ts — it has no
  // backing file to begin with), so removing one legitimately means "nothing to unlink on disk",
  // not an error.
  if (relPath === null) throw new ApiError(400, "Missing relPath", "missing-rel-path");

  if (relPath) fs.rmSync(resolveWithin(paths.mediaDir, relPath), { force: true });
  // The preview-only copy (see `media/proxy/route.ts`) goes with its original.
  if (proxyRelPath && !proxyRelPath.startsWith("..")) fs.rmSync(resolveWithin(paths.mediaDir, proxyRelPath), { force: true });
  // Images point their thumbnail back at the media file itself, which the line above already removed.
  if (thumbnailRelPath && !thumbnailRelPath.startsWith("..")) {
    fs.rmSync(resolveWithin(paths.thumbnailsDir, thumbnailRelPath), { force: true });
  }
  if (waveformRelPath && !waveformRelPath.startsWith("..")) {
    fs.rmSync(resolveWithin(paths.thumbnailsDir, waveformRelPath), { force: true });
  }

  return Response.json({ ok: true });
});
