import { getFollowerCount, getFollowingCount, isFollowing } from "../../_lib/follows";
import { publicSessionRoute } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";
import { getPublicProfile } from "../../_lib/profiles";
import { getTemplatesByIds, listPublicTemplatesByOwner } from "../../_lib/templates";
import { getTotalLikesForOwner, listLikedPublicTemplates } from "../../_lib/templateSocial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every real `id` here is a Supabase auth user id (a uuid) — reachable only via an `ownerId` this app
 *  itself already produced (Discover, the viewer's action rail, `/t/[id]`'s own creator link). A
 *  malformed one only ever shows up from someone hand-editing the URL, but Postgres itself rejects a
 *  non-uuid string against a `uuid` column with a hard error, not an empty result — confirmed live
 *  (`/api/vcut/creators/not-a-real-id` 500'd instead of 404ing) — so this checks the shape first and
 *  answers the same clean "not found" a real, nonexistent creator already gets. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A creator page (Phase 3, extended with Follow/counts) — display name, follower/following/total-like
 *  counts, whether the CURRENT viewer already follows them, and two grids: everything they've PUBLISHED
 *  (`listPublicTemplatesByOwner` — never their private work, even for themselves visiting their own
 *  page) and every public template they've themselves LIKED (`listLikedPublicTemplates` — see that
 *  function's own doc comment on why a private/unpublished like never leaks here). Genuinely public
 *  (`publicSessionRoute`) — reachable by tapping a name from the anonymous `/t/[id]` share page, not
 *  just from inside the signed-in app; `viewerIsFollowing` is simply `false` for an anonymous visitor
 *  (nothing to have followed as). A creator with zero published templates still returns 200 with an
 *  empty list (not 404) — there's nothing invalid about that state, unlike a template id that's private
 *  or doesn't exist at all. */
export const GET = publicSessionRoute(async (_req, user, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) throw new ApiError(404, "No such creator", "creator-not-found");
  const [profile, templates, followerCount, followingCount, totalLikes, viewerIsFollowing, likedIds] = await Promise.all([
    getPublicProfile(id),
    listPublicTemplatesByOwner(id),
    getFollowerCount(id),
    getFollowingCount(id),
    getTotalLikesForOwner(id),
    isFollowing(user?.id ?? null, id),
    listLikedPublicTemplates(id),
  ]);
  const likedTemplatesById = new Map((await getTemplatesByIds(likedIds)).map((t) => [t.id, t]));
  const likedTemplates = likedIds.map((tid) => likedTemplatesById.get(tid)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  const toRow = (t: { id: string; name: string; updatedAt: string; isPublic: boolean; ownerId: string }) => ({
    id: t.id,
    name: t.name,
    updatedAt: t.updatedAt,
    isPublic: t.isPublic,
    ownerId: t.ownerId,
  });
  return Response.json({
    id,
    displayName: profile.displayName,
    followerCount,
    followingCount,
    totalLikes,
    viewerIsFollowing,
    templates: templates.map(toRow),
    likedTemplates: likedTemplates.map(toRow),
  });
});
