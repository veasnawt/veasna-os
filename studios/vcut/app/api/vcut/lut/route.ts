import fs from "fs";
import { findLut } from "@veasnawt/vcut/src/project/createProject";
import { deserializeProject, serializeProject } from "@veasnawt/vcut/src/project/serialize";
import type { LutAsset } from "@veasnawt/vcut/src/project/types";
import { removeLutReferences } from "@veasnawt/vcut/src/timeline/operations";
import { LutParseError, parseCubeLut } from "@veasnawt/vcut/src/timeline/lut";
import { localRoute } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs, resolveWithin, uniqueFileName } from "../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function projectIdOf(req: Request): string {
  const id = new URL(req.url).searchParams.get("projectId");
  if (!id) throw new ApiError(400, "Missing projectId", "missing-project-id");
  return id;
}

/** Loads and validates `project.json` — same "round-trip through the validator before trusting it"
 *  spirit `project/route.ts`'s own `PUT` handler follows, just factored out here since this route
 *  needs to read-modify-write it twice (append on import, cascade-clear on delete). */
function loadProject(bpProjectId: string) {
  const paths = ensureProjectDirs(bpProjectId);
  if (!fs.existsSync(paths.projectFile)) {
    throw new ApiError(404, "Project not found", "project-not-found");
  }
  return deserializeProject(fs.readFileSync(paths.projectFile, "utf8"));
}

/** Written to a temp file and renamed, so a crash mid-write can't leave a truncated project.json where
 *  a complete one used to be — identical to `project/route.ts`'s own `PUT` handler; duplicated rather
 *  than shared since that route's own write is folded into a much larger handler this one has no
 *  reason to import. */
function saveProject(bpProjectId: string, project: Parameters<typeof serializeProject>[0]): void {
  const paths = ensureProjectDirs(bpProjectId);
  const tmp = `${paths.projectFile}.tmp`;
  fs.writeFileSync(tmp, serializeProject(project), "utf8");
  fs.renameSync(tmp, paths.projectFile);
}

/** Imports a `.cube` LUT file into the project's own LUT library.
 *
 *  Deliberately simpler than `media/route.ts`'s own `POST`: no ffprobe/thumbnail/filmstrip generation
 *  needed for a LUT, just parsing the file to validate it's actually a usable 3D LUT (and to pull out
 *  its `size`) before trusting it into the project. Unlike media import (a filesystem-only concern the
 *  CLIENT then merges into `project.assets` itself), this route ALSO appends the new `LutAsset` to
 *  `project.luts` and persists `project.json` directly — see `editorStore.importLut`'s own comment for
 *  why the two flows differ and how the client stays in sync with this route's write. */
export const POST = localRoute(async (req) => {
  const bpProjectId = projectIdOf(req);
  const paths = ensureProjectDirs(bpProjectId);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "No file was uploaded", "no-file");

  const text = await file.text();
  let parsed;
  try {
    parsed = parseCubeLut(text);
  } catch (err) {
    if (err instanceof LutParseError) throw new ApiError(400, err.message, "invalid-cube-lut");
    throw err;
  }

  const project = loadProject(bpProjectId);
  const fileName = uniqueFileName(file.name);
  const destination = resolveWithin(paths.lutsDir, fileName);
  fs.writeFileSync(destination, text, "utf8");

  const lut: LutAsset = {
    id: `lut_${crypto.randomUUID().slice(0, 8)}`,
    name: file.name,
    relPath: fileName,
    size: parsed.size,
    importedAt: Date.now(),
  };

  project.luts = [...project.luts, lut];
  saveProject(bpProjectId, project);

  return Response.json({ lut });
});

/** Removes a LUT from the project's library — deletes its file, drops the `LutAsset` entry from
 *  `project.luts`, and clears `lutId` off every clip that referenced it (`removeLutReferences`, the
 *  same "detach from clips first" cascade `operations.ts` already documents there) — all in one
 *  request, then returns the fully-updated project so the client can swap it straight in rather than
 *  reconciling the cascade itself. */
export const DELETE = localRoute(async (req) => {
  const bpProjectId = projectIdOf(req);
  const paths = ensureProjectDirs(bpProjectId);
  const lutId = new URL(req.url).searchParams.get("lutId");
  if (!lutId) throw new ApiError(400, "Missing lutId", "missing-lut-id");

  const project = loadProject(bpProjectId);
  const lut = findLut(project, lutId);
  if (!lut) throw new ApiError(404, "That LUT no longer exists", "lut-not-found");

  fs.rmSync(resolveWithin(paths.lutsDir, lut.relPath), { force: true });

  const cascaded = removeLutReferences(project, lutId);
  cascaded.luts = cascaded.luts.filter((l) => l.id !== lutId);
  saveProject(bpProjectId, cascaded);

  return Response.json({ project: cascaded });
});
