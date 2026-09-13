import { hostedOnlyRoute } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";
import { requirePro, setTemplatePublic } from "../../_lib/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `{ isPublic: boolean }` — publish/unpublish one of YOUR OWN templates (Phase 2's opt-in sharing,
 *  see `is_public`'s own migration comment). Pro-gated the same as every other template MUTATION in
 *  this app (`templates/route.ts`'s POST/DELETE) — only browsing/using an ALREADY-public template
 *  (`templates/discover/route.ts`, `templates/[id]/preview/route.ts`) skips the Pro gate, a deliberate,
 *  narrower carve-out, not a general loosening of this feature's own Pro requirement. */
export const PATCH = hostedOnlyRoute(async (req, user, context: { params: Promise<{ id: string }> }) => {
  await requirePro(user.id);
  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { isPublic?: boolean };
  if (typeof body.isPublic !== "boolean") throw new ApiError(400, "Missing isPublic", "missing-is-public");
  await setTemplatePublic(id, user.id, body.isPublic);
  return Response.json({ ok: true });
});
