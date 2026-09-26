import { instantiateTemplateContent } from "@veasnawt/vcut/src/project/template";
import { checkProjectOwnership } from "../../../_lib/auth";
import { corsPreflight, hostedOnlyRoute } from "../../../_lib/localOnly";
import { ApiError } from "../../../_lib/paths";
import { getViewableTemplate, requirePro, requireProForAiTemplate, resolveTemplateBundledAudio } from "../../../_lib/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST /api/vcut/templates/[id]/import` `{ projectId }` — resolves a template for the in-editor
 *  Templates tool (`ImportTemplateDialog.tsx`, `commands/index.ts`'s own `InsertTemplateCommand`), which
 *  drops the template's own tracks straight into an ALREADY-OPEN project's timeline rather than
 *  starting a brand-new one the way `project/route.ts`'s POST (and `[id]/project/route.ts`'s draft
 *  flow) do. `projectId` is the currently-open project this will be inserted into — used only to prove
 *  the caller genuinely owns a real, existing project before this does any real work on their behalf
 *  (same "prove you own a real project first" gate every other project-scoped mutation route takes),
 *  and to know whose account-wide library the template's bundled audio should land in.
 *
 *  Unlike `[id]/project/route.ts` (a read-only draft preview — no side effects, audio still in its
 *  "bundled, not yet copied" form), this one actually performs the real copy
 *  (`resolveTemplateBundledAudio`) up front, exactly like `project/route.ts`'s own template branch does
 *  when it creates a whole new project — reasonable here too, since inserting into an existing project
 *  is just as real and immediate an action as creating one. Video/image clips come back exactly as the
 *  template stored them: still placeholders (`Asset.templatePlaceholder`), for the dialog's own "fill
 *  these slots before inserting" step to resolve locally, the same way `TemplateFillScreen.tsx`/
 *  `fillTemplateSlot` already do for a brand-new template-origin project.
 *
 *  `instantiateTemplateContent` runs BEFORE `resolveTemplateBundledAudio`, not after — same order
 *  `project/route.ts`'s own template branch already uses, and for the same reason: a template's own
 *  STORED audio-asset id is fixed forever (`sanitizeProjectForTemplate` never re-mints it — see that
 *  function's own doc comment), so calling `resolveTemplateBundledAudio` directly on `template.project`
 *  would try to `insertUserMedia` under that SAME fixed id on every single import — colliding with
 *  itself on a second import of the same template (by anyone, including a different user). Remapping
 *  FIRST gives every import its own fresh, one-off id to create that library row under, exactly once. */
export const POST = hostedOnlyRoute(async (req, user, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { projectId?: string };
  const projectId = body.projectId;
  if (!projectId) throw new ApiError(400, "Missing projectId", "missing-project-id");
  await checkProjectOwnership(user.id, projectId);

  const template = await getViewableTemplate(id, user.id);
  // Same "Free can use someone else's published template; only publishing/using your OWN privately-
  // saved one needs Pro" split every other template-consuming route in this app already applies.
  if (template.ownerId === user.id) await requirePro(user.id);
  await requireProForAiTemplate(user.id, template.project);

  const { assets, tracks } = instantiateTemplateContent(template.project);
  const resolvedAssets = await resolveTemplateBundledAudio(id, user.id, assets);
  return Response.json({
    name: template.name,
    tags: template.tags,
    project: { width: template.project.width, height: template.project.height, fps: template.project.fps, tracks, assets: resolvedAssets },
  });
});

export const OPTIONS = corsPreflight;
