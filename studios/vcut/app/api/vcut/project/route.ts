import fs from "fs";
import { createProject } from "@veasnawt/vcut/src/project/createProject";
import { deserializeProject, serializeProject } from "@veasnawt/vcut/src/project/serialize";
import { buildProjectFromTemplate } from "@veasnawt/vcut/src/project/template";
import { requireSessionUser, upsertProjectIndex, deleteProjectIndex, VCUT_HOSTED } from "../_lib/auth";
import { localRoute } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs } from "../_lib/paths";
import { getOwnedTemplate, requirePro } from "../_lib/templates";

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
 *  display-only prop that VCut's own project list (`/api/vcut/projects`) would otherwise never
 *  see — every project would show as "Untitled" there even though the host knew its real name. */
export const GET = localRoute(async (req) => {
  const bpProjectId = projectIdOf(req);
  const paths = ensureProjectDirs(bpProjectId);

  if (!fs.existsSync(paths.projectFile)) {
    // The BP-Studio-iframe convenience (a host handing in a projectId it already knows, auto-created
    // on first visit) only makes sense when there's exactly one implicit local user — in hosted mode
    // it would let anyone create-and-own a project at a GUESSED id, an id-squatting footgun. `POST`
    // below is the only way to create a project in hosted mode; this just 404s instead. (The generic
    // ownership gate in `localOnly.ts` already rejects this case first in practice, since a project
    // id with no `projects_index` row fails its ownership check before this handler even runs — this
    // is the explicit, defense-in-depth version of that, not the only thing preventing it.)
    if (VCUT_HOSTED) throw new ApiError(404, "Project not found", "project-not-found");
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

/** Creates a brand-new project with a server-generated id — the path VCut's own home page (`/`)
 *  uses to start a fresh project without a host app (BP Studio, previously the only caller) handing
 *  in an id up front. `GET` above still handles "load or create-if-missing for a caller-supplied
 *  id", which is what an `<iframe src>` with a `projectId` already baked into its query string needs
 *  — the two aren't redundant, they're create-with-a-name vs. open/create-by-a-given-key. */
export const POST = localRoute(async (req) => {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    width?: number;
    height?: number;
    fps?: number;
    templateId?: string;
  };
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : "Untitled";

  // Optional — the home page's resolution picker sends real values; any other caller (or a request
  // missing one of the three) falls straight through to createProject's own SHORT_PRESET default,
  // same as before this existed.
  const preset =
    typeof body.width === "number" && typeof body.height === "number" && typeof body.fps === "number"
      ? { width: body.width, height: body.height, fps: body.fps }
      : undefined;

  const id = crypto.randomUUID();
  const paths = ensureProjectDirs(id);

  // Re-derived here rather than threaded from below — `templateId` only means anything once a
  // session exists to own the template being read (see `getOwnedTemplate`'s own ownership check),
  // and templates don't exist outside hosted mode at all (no "Pro" concept locally) — silently
  // ignored rather than erroring there, the same "nothing meaningful to gate on" tolerance
  // `shouldIncludeOutro` (export/route.ts) already gives its own Pro check off the hosted deploy.
  let hostedUser: Awaited<ReturnType<typeof requireSessionUser>> | null = null;
  if (VCUT_HOSTED) hostedUser = await requireSessionUser(req);

  let project;
  if (body.templateId && hostedUser) {
    await requirePro(hostedUser.id);
    const template = await getOwnedTemplate(body.templateId, hostedUser.id);
    project = buildProjectFromTemplate(id, name, template);
  } else {
    project = preset ? createProject(id, name, preset) : createProject(id, name);
  }

  // The one place `ownerId` is ever decided: a fresh `crypto.randomUUID()` id, written once, so
  // there's no race to worry about (unlike a save, which could race a concurrent request for the
  // SAME id — creation always mints a brand-new one). `projects_index` gets its row here too, in the
  // same request, so `GET /api/vcut/projects` sees the new project immediately rather than after its
  // first save.
  if (hostedUser) {
    project.ownerId = hostedUser.id;
    await upsertProjectIndex(id, hostedUser.id, project.name, project.updatedAt);
  }
  fs.writeFileSync(paths.projectFile, serializeProject(project), "utf8");

  return Response.json({ project });
});

/** Deletes a project folder entirely — project.json, imported media, thumbnails, and exports. Used
 *  by the standalone home page's project list to let old/test/abandoned projects actually be cleaned
 *  up, since nothing else ever removes a project once created (see `projects/route.ts`, which scans
 *  every folder under `VCUT_ROOT` unconditionally). Recursive removal of a project's own directory
 *  only — `projectPaths`/`assertValidProjectId` already confine `bpProjectId` to a safe character set
 *  before it's ever joined into a path, so this can't be tricked into deleting outside its own folder. */
export const DELETE = localRoute(async (req) => {
  const bpProjectId = projectIdOf(req);
  const paths = ensureProjectDirs(bpProjectId);
  fs.rmSync(paths.dir, { recursive: true, force: true });
  // Without this, a deleted project leaves a phantom `projects_index` row — `GET /api/vcut/projects`
  // would keep listing it forever, pointing at a folder that no longer exists.
  if (VCUT_HOSTED) await deleteProjectIndex(bpProjectId);
  return Response.json({ ok: true });
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

  // `localRoute`'s own gate already confirmed the session owns `bpProjectId` before this handler
  // ever runs — but the CLIENT still supplied this whole `project` object, `ownerId` field included,
  // and a save is exactly the kind of request a crafted body could try to slip a different value
  // into. Force it back to the session's own id rather than trusting whatever the request body says,
  // so a save can never reassign a project's ownership. `requireSessionUser` re-verifies the same
  // bearer token the gate already checked — a second cheap Supabase call, not a second check of
  // something already trusted, just how the resolved user reaches this specific handler (see
  // `_lib/auth.ts`'s own doc comment on why `localRoute` doesn't thread it through directly).
  if (VCUT_HOSTED) {
    const user = await requireSessionUser(req);
    project.ownerId = user.id;
    await upsertProjectIndex(bpProjectId, user.id, project.name, project.updatedAt);
  }

  // Written to a temp file and renamed, so a crash mid-write can't leave a truncated project.json
  // where a complete one used to be. rename is atomic within a filesystem.
  const tmp = `${paths.projectFile}.tmp`;
  fs.writeFileSync(tmp, serializeProject(project), "utf8");
  fs.renameSync(tmp, paths.projectFile);

  return Response.json({ ok: true, savedAt: Date.now() });
});
