import fs from "fs";
import { deserializeProject, serializeProject } from "@veasnawt/vcut/src/project/serialize";
import { readAssFontMetrics } from "@veasnawt/vcut/src/project/fonts";
import type { CustomFontAsset } from "@veasnawt/vcut/src/project/types";
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
 *  helper — duplicated rather than shared for the same reason that one gives (this route needs its
 *  own read-modify-write, and factoring a two-line pair out into a shared module isn't worth the
 *  indirection). */
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

/** Imports a `.ttf`/`.otf` font file into the project's own custom-font library — same shape as
 *  `lut/route.ts`'s `POST`: validates the upload (here, that it actually parses as a real font —
 *  `readAssFontMetrics` is the same real TTF/OTF-table parser `wordHighlight`/Khmer export already
 *  trusts, not a separate, weaker check) before writing it to disk and appending a `CustomFontAsset` to
 *  `project.customFonts`, persisting `project.json` directly (not client-merged, same reasoning
 *  `editorStore.importLut`'s own comment gives for LUTs). */
export const POST = localRoute(async (req) => {
  const bpProjectId = projectIdOf(req);
  const paths = ensureProjectDirs(bpProjectId);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "No file was uploaded", "no-file");
  if (!/\.(ttf|otf)$/i.test(file.name)) throw new ApiError(400, "Only .ttf and .otf font files are supported", "invalid-font-format");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const metrics = readAssFontMetrics(bytes);
  if (!metrics) throw new ApiError(400, "That file doesn't look like a valid font", "invalid-font-file");

  const project = loadProject(bpProjectId);
  const fileName = uniqueFileName(file.name);
  const destination = resolveWithin(paths.customFontsDir, fileName);
  fs.writeFileSync(destination, bytes);

  const font: CustomFontAsset = {
    id: `cfont_${crypto.randomUUID().slice(0, 8)}`,
    label: file.name.replace(/\.(ttf|otf)$/i, ""),
    relPath: fileName,
    importedAt: Date.now(),
  };

  project.customFonts = [...project.customFonts, font];
  saveProject(bpProjectId, project);

  return Response.json({ font });
});

/** Removes a custom font from the project's library. Unlike `lut/route.ts`'s `DELETE`, no cascade
 *  through clips is needed: `fontById` (see its own doc comment) already falls back to the default
 *  bundled font for any unrecognized `fontFamily` id, so a text clip that referenced this font simply
 *  reverts to that default the next time it's resolved — the same graceful behavior an old project
 *  referencing a since-removed bundled font ID already gets, not a new special case. */
export const DELETE = localRoute(async (req) => {
  const bpProjectId = projectIdOf(req);
  const paths = ensureProjectDirs(bpProjectId);
  const fontId = new URL(req.url).searchParams.get("fontId");
  if (!fontId) throw new ApiError(400, "Missing fontId", "missing-font-id");

  const project = loadProject(bpProjectId);
  const font = project.customFonts.find((f) => f.id === fontId);
  if (!font) throw new ApiError(404, "That font no longer exists", "font-not-found");

  fs.rmSync(resolveWithin(paths.customFontsDir, font.relPath), { force: true });
  project.customFonts = project.customFonts.filter((f) => f.id !== fontId);
  saveProject(bpProjectId, project);

  return Response.json({ project });
});
