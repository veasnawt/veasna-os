import fs from "fs";
import { deserializeProject, serializeProject } from "@veasnawt/vcut/src/project/serialize";
import type { CustomSfxAsset } from "@veasnawt/vcut/src/project/types";
import { probeMedia } from "../_lib/ffmpeg";
import { localRoute } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs, resolveWithin, uniqueFileName } from "../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function projectIdOf(req: Request): string {
  const id = new URL(req.url).searchParams.get("projectId");
  if (!id) throw new ApiError(400, "Missing projectId", "missing-project-id");
  return id;
}

/** Same "round-trip through the validator before trusting it" shape as `lut/route.ts`'s identical
 *  helper — see `fonts/route.ts`'s own copy for why this is duplicated rather than shared. */
function loadProject(bpProjectId: string) {
  const paths = ensureProjectDirs(bpProjectId);
  if (!fs.existsSync(paths.projectFile)) {
    throw new ApiError(404, "Project not found", "project-not-found");
  }
  return deserializeProject(fs.readFileSync(paths.projectFile, "utf8"));
}

function saveProject(bpProjectId: string, project: Parameters<typeof serializeProject>[0]): void {
  const paths = ensureProjectDirs(bpProjectId);
  const tmp = `${paths.projectFile}.tmp`;
  fs.writeFileSync(tmp, serializeProject(project), "utf8");
  fs.renameSync(tmp, paths.projectFile);
}

/** Imports an audio file into the project's own custom-SFX library — a PERSISTENT, browsable entry
 *  (`SfxPanel`'s "My Sounds"), not the same thing as the one-shot "copy a bundled clip onto the
 *  timeline" flow (see `CustomSfxAsset`'s own doc comment for why the two differ). Validated with the
 *  same real `probeMedia` ffprobe check `media/route.ts`'s own import uses — written to disk first
 *  since `probeMedia` reads a file path, cleaned up again if the probe rejects it. */
export const POST = localRoute(async (req) => {
  const bpProjectId = projectIdOf(req);
  const paths = ensureProjectDirs(bpProjectId);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "No file was uploaded", "no-file");

  const project = loadProject(bpProjectId);
  const fileName = uniqueFileName(file.name);
  const destination = resolveWithin(paths.customSfxDir, fileName);
  fs.writeFileSync(destination, new Uint8Array(await file.arrayBuffer()));

  let probe;
  try {
    probe = await probeMedia(destination);
  } catch (err) {
    fs.rmSync(destination, { force: true });
    throw err;
  }
  if (!probe.hasAudio || probe.duration <= 0) {
    fs.rmSync(destination, { force: true });
    throw new ApiError(400, "That file contains no playable audio", "empty-media");
  }

  const sfx: CustomSfxAsset = {
    id: `csfx_${crypto.randomUUID().slice(0, 8)}`,
    label: file.name.replace(/\.[^.]+$/, ""),
    relPath: fileName,
    importedAt: Date.now(),
  };

  project.customSfx = [...project.customSfx, sfx];
  saveProject(bpProjectId, project);

  return Response.json({ sfx });
});

/** Removes a custom SFX entry from the project's library — deletes its file and drops the
 *  `CustomSfxAsset` entry. No cascade through clips needed: unlike a font or LUT that's referenced BY
 *  ID from a clip, an SFX "Add" already COPIES the file into `project.assets` as an ordinary media
 *  asset the instant it's placed on the timeline (see `CustomSfxAsset`'s own doc comment) — a clip on
 *  the timeline never references a `CustomSfxAsset` id directly, so removing the library entry can
 *  never orphan one. */
export const DELETE = localRoute(async (req) => {
  const bpProjectId = projectIdOf(req);
  const paths = ensureProjectDirs(bpProjectId);
  const sfxId = new URL(req.url).searchParams.get("sfxId");
  if (!sfxId) throw new ApiError(400, "Missing sfxId", "missing-sfx-id");

  const project = loadProject(bpProjectId);
  const sfx = project.customSfx.find((s) => s.id === sfxId);
  if (!sfx) throw new ApiError(404, "That sound no longer exists", "sfx-not-found");

  fs.rmSync(resolveWithin(paths.customSfxDir, sfx.relPath), { force: true });
  project.customSfx = project.customSfx.filter((s) => s.id !== sfxId);
  saveProject(bpProjectId, project);

  return Response.json({ project });
});
