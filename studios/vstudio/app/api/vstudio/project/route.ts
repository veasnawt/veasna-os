import fs from "fs";
import { createProject } from "@veasna/vstudio/src/project/createProject";
import { deserializeProject, serializeProject } from "@veasna/vstudio/src/project/serialize";
import { localRoute } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs } from "../_lib/paths";

/** These routes touch the real filesystem, so they must run on Node — not the Edge runtime, which
 *  has no `fs` and no ability to spawn FFmpeg. */
export const runtime = "nodejs";
// Project state changes constantly during an edit; a cached response would show a stale timeline.
export const dynamic = "force-dynamic";

function projectIdOf(req: Request): string {
  const id = new URL(req.url).searchParams.get("projectId");
  if (!id) throw new ApiError(400, "Missing projectId", "missing-project-id");
  return id;
}

/** Loads the project for a given key, creating a fresh one on first visit so opening the editor
 *  always lands in a usable state rather than an error — the path a host app's `<iframe src>` (BP
 *  Studio's Create page, today) with a `projectId` already baked into its query string takes.
 *
 *  An optional `projectName` is used ONLY at creation time, so the name a host app already knows
 *  (BP's own project title) is actually saved into `project.name`, not just passed around as a
 *  display-only prop that VStudio's own project list (`/api/vstudio/projects`) would otherwise never
 *  see — every project would show as "Untitled" there even though the host knew its real name. */
export const GET = localRoute(async (req) => {
  const bpProjectId = projectIdOf(req);
  const paths = ensureProjectDirs(bpProjectId);

  if (!fs.existsSync(paths.projectFile)) {
    const rawName = new URL(req.url).searchParams.get("projectName");
    const name = rawName && rawName.trim() ? rawName.trim().slice(0, 120) : undefined;
    const project = createProject(bpProjectId, name);
    fs.writeFileSync(paths.projectFile, serializeProject(project), "utf8");
    return Response.json({ project, created: true });
  }

  const raw = fs.readFileSync(paths.projectFile, "utf8");
  // deserializeProject validates and throws ProjectFormatError on anything it can't read correctly,
  // which localRoute turns into a 500 with that message rather than serving a half-parsed project.
  const project = deserializeProject(raw);
  return Response.json({ project, created: false });
});

/** Creates a brand-new project with a server-generated id — the path VStudio's own home page (`/`)
 *  uses to start a fresh project without a host app (BP Studio, previously the only caller) handing
 *  in an id up front. `GET` above still handles "load or create-if-missing for a caller-supplied
 *  id", which is what an `<iframe src>` with a `projectId` already baked into its query string needs
 *  — the two aren't redundant, they're create-with-a-name vs. open/create-by-a-given-key. */
export const POST = localRoute(async (req) => {
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : "Untitled";

  const id = crypto.randomUUID();
  const paths = ensureProjectDirs(id);
  const project = createProject(id, name);
  fs.writeFileSync(paths.projectFile, serializeProject(project), "utf8");

  return Response.json({ project });
});

export const PUT = localRoute(async (req) => {
  const bpProjectId = projectIdOf(req);
  const paths = ensureProjectDirs(bpProjectId);

  const body = (await req.json()) as { project?: unknown };
  if (!body?.project) throw new ApiError(400, "Missing project in request body", "missing-project");

  // Round-tripped through the validator before hitting disk: a malformed project rejected here is
  // recoverable, one written to disk is a corrupted save the user can't undo.
  const project = deserializeProject(JSON.stringify(body.project));
  if (project.bpProjectId !== bpProjectId) {
    throw new ApiError(400, "Project belongs to a different BP project", "project-mismatch");
  }

  // Written to a temp file and renamed, so a crash mid-write can't leave a truncated project.json
  // where a complete one used to be. rename is atomic within a filesystem.
  const tmp = `${paths.projectFile}.tmp`;
  fs.writeFileSync(tmp, serializeProject(project), "utf8");
  fs.renameSync(tmp, paths.projectFile);

  return Response.json({ ok: true, savedAt: Date.now() });
});
