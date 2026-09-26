import { corsPreflight, hostedOnlyRoute } from "../../../_lib/localOnly";
import { getViewableTemplate, requirePro, requireProForAiTemplate } from "../../../_lib/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A template's own structure (`TemplateProjectData`) and name, for opening it as an unsaved draft —
 *  `TemplateDraftApp` builds a project from this in memory and shows the fill screen, so no real
 *  project is created until media is actually picked (asked for directly: tapping "Use this template"
 *  and backing out used to leave an empty project behind, plus a copy of the template's music in your
 *  library). The access rule is the same one `project/route.ts`'s own POST applies when it later
 *  creates the project from this template: yours or public, Pro-gated only when it's yours. */
export const GET = hostedOnlyRoute(async (_req, user, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const template = await getViewableTemplate(id, user.id);
  if (template.ownerId === user.id) await requirePro(user.id);
  await requireProForAiTemplate(user.id, template.project);
  return Response.json({ name: template.name, project: template.project, tags: template.tags });
});

// `loadTemplateForDraft`'s native (mobile) branch calls this cross-origin with an Authorization header
// — same preflight gap as every other template route, see `templates/discover/route.ts`'s own doc
// comment.
export const OPTIONS = corsPreflight;
