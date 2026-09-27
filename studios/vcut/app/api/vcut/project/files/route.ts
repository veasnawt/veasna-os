import fs from "fs/promises";
import path from "path";
import { listProjectsForOwner, requireSessionUser, VCUT_HOSTED } from "../../_lib/auth";
import { localRouteCors, corsPreflight } from "../../_lib/localOnly";
import { ApiError, projectPaths, uniqueFileName, ensureUserMediaDirs } from "../../_lib/paths";
import { getProfile } from "../../_lib/profiles";
import { checkStorageQuota } from "../../_lib/userMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Transfer supplementary project libraries without mutating the project or its revision.
 * The following project PUT commits all references together with optimistic concurrency. */
export const POST = localRouteCors(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("projectId");
  if (!id) throw new ApiError(400, "Missing projectId");
  const paths = projectPaths(id);
  const kind = url.searchParams.get("kind");
  const directory = kind === "thumbnail" ? (VCUT_HOSTED ? ensureUserMediaDirs((await requireSessionUser(req)).id).thumbnailsDir : paths.thumbnailsDir) : kind === "lut" ? paths.lutsDir : kind === "customFont" ? paths.customFontsDir : kind === "customSfx" ? paths.customSfxDir : null;
  if (!directory) throw new ApiError(400, "Unknown project library");
  if (Number(req.headers.get("content-length")) > 64 * 1024 * 1024) throw new ApiError(413, "Library files must be under 64 MB");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size > 64 * 1024 * 1024) throw new ApiError(400, "Choose a library file under 64 MB");
  const ext = path.extname(file.name).toLowerCase();
  const allowed = kind === "thumbnail" ? [".png", ".jpg", ".jpeg", ".webp"] : kind === "lut" ? [".cube"] : kind === "customFont" ? [".ttf", ".otf", ".woff", ".woff2"] : [".wav", ".mp3", ".m4a", ".ogg", ".aac", ".flac"];
  if (!allowed.includes(ext)) throw new ApiError(400, "Unsupported library file");
  if (VCUT_HOSTED) {
    const user = await requireSessionUser(req);
    const plan = (await getProfile(user.id))?.plan ?? "free";
    let supplementalBytes = 0;
    const thumbnails = ensureUserMediaDirs(user.id).thumbnailsDir;
    for (const entry of await fs.readdir(thumbnails, { withFileTypes: true }).catch(() => [])) {
      if (entry.isFile()) supplementalBytes += (await fs.stat(path.join(thumbnails, entry.name))).size;
    }
    for (const row of await listProjectsForOwner(user.id)) {
      const owned = projectPaths(row.id);
      for (const dir of [owned.lutsDir, owned.customFontsDir, owned.customSfxDir]) {
        for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
          if (entry.isFile()) supplementalBytes += (await fs.stat(path.join(dir, entry.name))).size;
        }
      }
    }
    await checkStorageQuota(user.id, plan, file.size + supplementalBytes);
  }
  const relPath = uniqueFileName(file.name);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, relPath), new Uint8Array(await file.arrayBuffer()), { flag: "wx" });
  return Response.json({ relPath });
});
export const OPTIONS = corsPreflight;
