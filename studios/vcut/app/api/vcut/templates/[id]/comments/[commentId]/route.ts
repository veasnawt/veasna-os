import { corsPreflight, hostedOnlyRoute } from "../../../../_lib/localOnly";
import { getViewableTemplate } from "../../../../_lib/templates";
import { deleteComment, editComment } from "../../../../_lib/templateSocial";
import { ApiError } from "../../../../_lib/paths";

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
  const removedCount = await deleteComment(commentId, id, user.id, template.ownerId);
  return Response.json({ ok: true, removedCount });
});

export const PATCH = hostedOnlyRoute(async (req, user, context: { params: Promise<{ id: string; commentId: string }> }) => {
  const { id, commentId } = await context.params;
  await getViewableTemplate(id, user.id);
  const body = (await req.json().catch(() => ({}))) as { body?: string };
  if (typeof body.body !== "string") throw new ApiError(400, "Missing body", "missing-comment-body");
  await editComment(commentId, id, user.id, body.body);
  return Response.json({ ok: true });
});

export const OPTIONS = corsPreflight;
