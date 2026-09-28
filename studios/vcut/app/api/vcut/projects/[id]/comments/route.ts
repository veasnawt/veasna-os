import { corsPreflight, hostedOnlyRoute } from "../../../_lib/localOnly";
import { ApiError } from "../../../_lib/paths";
import { createReviewComment, listReviewMarkers, listReviewThreads, reviewAccess } from "../../../_lib/reviewComments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export const GET = hostedOnlyRoute(async (req, user, context: Context) => {
  const { id } = await context.params;
  const access = await reviewAccess(id, user.id);
  const url = new URL(req.url);
  if (url.searchParams.get("view") === "markers") {
    return Response.json({ markers: await listReviewMarkers(id) }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const before = url.searchParams.get("before");
  const resolved = url.searchParams.get("status") === "resolved";
  const page = await listReviewThreads(id, resolved, before);
  return Response.json({ ...page, ownerId: access.ownerId, isOwner: access.isOwner }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = hostedOnlyRoute(async (req, user, context: Context) => {
  const { id } = await context.params;
  await reviewAccess(id, user.id);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body || typeof body !== "object") throw new ApiError(400, "Invalid comment", "invalid-comment");
  const comment = await createReviewComment(id, user.id, body.body, body.parentCommentId, body.timelineTime);
  return Response.json({ comment }, { status: 201 });
});

export const OPTIONS = corsPreflight;
