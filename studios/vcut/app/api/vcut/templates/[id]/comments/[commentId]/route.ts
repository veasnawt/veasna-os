import { hostedOnlyRoute } from "../../../../_lib/localOnly";
import { getViewableTemplate } from "../../../../_lib/templates";
import { deleteComment } from "../../../../_lib/templateSocial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Basic" moderation, per Phase 3's own scoping — see `deleteComment`'s own doc comment for the exact
 *  rule (your own comment, or any comment on a template YOU own). `getViewableTemplate` here isn't
 *  really an access check (this route doesn't need to re-verify the comment's own visibility) — it's
 *  the cheapest way to learn the template's `ownerId` to hand to `deleteComment`, which does the actual
 *  authorization. */
export const DELETE = hostedOnlyRoute(async (_req, user, context: { params: Promise<{ id: string; commentId: string }> }) => {
  const { id, commentId } = await context.params;
  const template = await getViewableTemplate(id, user.id);
  await deleteComment(commentId, user.id, template.ownerId);
  return Response.json({ ok: true });
});
