import { hostedOnlyRoute } from "../../../_lib/localOnly";
import { followUser, unfollowUser } from "../../../_lib/follows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Follow/unfollow a creator as the signed-in caller -- real auth required either way (no anonymous
 *  following, matching every other write in this app's social surface). No Pro gate: following, like
 *  liking, is browsing-adjacent, not a paid feature. */
export const POST = hostedOnlyRoute(async (_req, user, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  await followUser(user.id, id);
  return Response.json({ ok: true });
});

export const DELETE = hostedOnlyRoute(async (_req, user, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  await unfollowUser(user.id, id);
  return Response.json({ ok: true });
});
