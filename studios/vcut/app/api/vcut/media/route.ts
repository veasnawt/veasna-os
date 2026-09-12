import fs from "fs";
import path from "path";
import { importMediaBytes } from "../_lib/importMedia";
import { localRoute } from "../_lib/localOnly";
import { kindForExtension, SUPPORTED_EXTENSIONS } from "../_lib/mediaFormats";
import { ApiError, ensureProjectDirs, resolveWithin } from "../_lib/paths";

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
  const asset = await importMediaBytes(paths, bytes, file.name);

  return Response.json({ asset });
});

/** Removes an imported file from the project folder. Only ever touches VCut's own copy inside
 *  `.vcut/<project>/media` — the user's original file is never a candidate for deletion. */
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
