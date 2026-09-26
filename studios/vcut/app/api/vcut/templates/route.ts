import fs from "fs";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import { newTemplateId, sanitizeProjectForTemplate } from "@veasnawt/vcut/src/project/template";
import { checkProjectOwnership } from "../_lib/auth";
import { corsPreflight, hostedOnlyRoute } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs, userMediaPaths } from "../_lib/paths";
import {
  bundleTemplateAudio,
  deleteOwnedTemplate,
  insertTemplate,
  listTemplatesForOwner,
  renderTemplatePreview,
  requirePro,
  templateAiCredits,
} from "../_lib/templates";

/** Reads/writes `project.json` off disk to build a template from it (POST). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hosted-only, same as every billing route (`hostedOnlyRoute`) — there is no local/desktop concept
 *  of "Pro" for this to gate against, unlike `localRoute`'s "IP check locally, real auth hosted"
 *  split every project/media route uses. Not scoped by a single `?projectId=` the way `localRoute`'s
 *  own generic gate expects either (GET/DELETE key off the template's own id, not a project's), so
 *  each handler below does its own explicit ownership check instead. */

export const GET = hostedOnlyRoute(async (_req, user) => {
  await requirePro(user.id);
  const templates = await listTemplatesForOwner(user.id);
  return Response.json({ templates: templates.map((t) => ({ ...t, aiCredits: templateAiCredits(t.project) })) });
});

/** `{ name, projectId, keepAssetIds? }` — sanitizes the given project (see
 *  `sanitizeProjectForTemplate`'s own doc comment: every clip's timing/effects/transitions survive; a
 *  video/image clip's real file is replaced with a fillable placeholder, while an audio clip's real
 *  file is bundled with the template itself via `bundleTemplateAudio` below) and saves the result as a
 *  new template row. `keepAssetIds` is `SaveAsTemplateDialog.tsx`'s own checklist — the ids of
 *  candidate slots the author chose to KEEP fixed instead, bundled the same way audio already is
 *  rather than becoming a fillable placeholder. `checkProjectOwnership` is the same ownership check
 *  `localRoute`'s own generic `?projectId=`
 *  gate would give for free — done explicitly here since this route isn't wrapped in `localRoute` at
 *  all (Pro-gating needs to run first, and `hostedOnlyRoute` has no project-ownership concept of its
 *  own to layer that on top of). */
export const POST = hostedOnlyRoute(async (req, user) => {
  await requirePro(user.id);
  const body = (await req.json().catch(() => ({}))) as { name?: string; projectId?: string; keepAssetIds?: unknown };
  const projectId = body.projectId;
  if (!projectId) throw new ApiError(400, "Missing projectId", "missing-project-id");
  await checkProjectOwnership(user.id, projectId);

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : "Untitled template";
  const keepAssetIds = new Set(Array.isArray(body.keepAssetIds) ? body.keepAssetIds.filter((id): id is string => typeof id === "string") : []);
  const paths = ensureProjectDirs(projectId);
  if (!fs.existsSync(paths.projectFile)) throw new ApiError(404, "Project not found", "project-not-found");
  const project = deserializeProject(fs.readFileSync(paths.projectFile, "utf8"));

  const id = newTemplateId();
  // Renders a short preview clip from the REAL, unstripped project — must happen BEFORE
  // `sanitizeProjectForTemplate` below replaces every video/image clip's real footage with a bare
  // placeholder, since a placeholder has nothing left to render (see that function's own doc
  // comment). Best-effort: never throws, never blocks saving the template on a render failure — see
  // `renderTemplatePreview`'s own doc comment.
  // In the background: rendering the previews of a layered template takes minutes, longer than a request may run (the proxy cut
  // the connection and the save looked failed), and a template saves fine without them — the tile shows a placeholder until they
  // exist (the poster is regenerated on first request, and the viewer falls back to the short preview).
  void renderTemplatePreview(id, structuredClone(project), paths, userMediaPaths(user.id).mediaDir).catch((err) =>
    console.error("[vcut] templates: background preview render failed for", id, err)
  );

  const sanitized = sanitizeProjectForTemplate(project, keepAssetIds);
  // Copies each bundled-audio asset's real file into this template's own permanent storage — see
  // `bundleTemplateAudio`'s own doc comment. Everything else in `sanitized` (placeholders, text/color)
  // passes through unchanged.
  sanitized.assets = await bundleTemplateAudio(id, user.id, paths, sanitized.assets);
  await insertTemplate(id, user.id, name, sanitized);
  return Response.json({ id, name });
});

/** `?id=...` — `deleteOwnedTemplate` scopes the delete to `owner_id` in the query itself, so this
 *  never needs a separate "does this even belong to you" check first (see that function's own doc
 *  comment for why matching zero rows either way is the correct, information-hiding behavior). */
export const DELETE = hostedOnlyRoute(async (req, user) => {
  await requirePro(user.id);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new ApiError(400, "Missing id", "missing-template-id");
  await deleteOwnedTemplate(id, user.id);
  return Response.json({ ok: true });
});

// Answers the CORS preflight desktop/mobile's cross-origin `Authorization`-bearing calls trigger — see
// `templates/discover/route.ts`'s own doc comment on this exact `OPTIONS` export for the full "why."
export const OPTIONS = corsPreflight;
