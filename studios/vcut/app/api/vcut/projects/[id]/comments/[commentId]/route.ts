import { corsPreflight, hostedOnlyRoute } from "../../../../_lib/localOnly";
import { deleteReviewComment, editReviewComment, getReviewThread, reviewAccess, setReviewResolution } from "../../../../_lib/reviewComments";
import { ApiError } from "../../../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; commentId: string }> };

export const GET = hostedOnlyRoute(async (_req, user, context: Context) => {
  const { id, commentId } = await context.params;
  await reviewAccess(id, user.id);
  return Response.json({ comments: await getReviewThread(id, commentId) }, { headers: { "Cache-Control": "private, no-store" } });
});

export const PATCH = hostedOnlyRoute(async (req, user, context: Context) => {
  const { id, commentId } = await context.params;
  await reviewAccess(id, user.id);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body && Object.prototype.hasOwnProperty.call(body, "resolved")) {
    if (typeof body.resolved !== "boolean") throw new ApiError(400, "Invalid resolution", "invalid-resolution");
    return Response.json({ comment: await setReviewResolution(id, commentId, body.resolved, user.id) });
  }
  return Response.json({ comment: await editReviewComment(id, commentId, user.id, body?.body) });
});

export const DELETE = hostedOnlyRoute(async (_req, user, context: Context) => {
  const { id, commentId } = await context.params;
  const access = await reviewAccess(id, user.id);
  await deleteReviewComment(id, commentId, user.id, access.ownerId);
  return Response.json({ ok: true });
});

export const OPTIONS = corsPreflight;
