import { corsPreflight, hostedOnlyRoute } from "../../../_lib/localOnly";
import { ApiError } from "../../../_lib/paths";
import { inviteReviewer, listReviewPeople, removeReviewer, reviewAccess } from "../../../_lib/reviewComments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export const GET = hostedOnlyRoute(async (_req, user, context: Context) => {
  const { id } = await context.params;
  const access = await reviewAccess(id, user.id);
  return Response.json({ people: await listReviewPeople(id, access.ownerId), isOwner: access.isOwner }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = hostedOnlyRoute(async (req, user, context: Context) => {
  const { id } = await context.params;
  const access = await reviewAccess(id, user.id);
  if (!access.isOwner) throw new ApiError(403, "Only the owner can invite reviewers", "forbidden");
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return Response.json({ people: await inviteReviewer(id, user.id, body?.username) }, { status: 201 });
});

export const DELETE = hostedOnlyRoute(async (req, user, context: Context) => {
  const { id } = await context.params;
  const access = await reviewAccess(id, user.id);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body?.userId !== "string") throw new ApiError(400, "Missing reviewer", "missing-reviewer");
  await removeReviewer(id, user.id, access.ownerId, body.userId);
  return Response.json({ people: body.userId === user.id ? [] : await listReviewPeople(id, access.ownerId) });
});

export const OPTIONS = corsPreflight;
