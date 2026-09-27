import { getFollowerCount, getFollowingCount, isFollowing } from "../../_lib/follows";
import { publicSessionRoute, withCors } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";
import { getPublicProfile, resolveProfileIdFromUrlSegment } from "../../_lib/profiles";
import { getTemplatesByIds, listPublicTemplatesByOwner, templateAiCredits } from "../../_lib/templates";
import type { TemplateProjectData } from "@veasnawt/vcut/src/project/template";
import { getTotalLikesForOwner, listLikedPublicTemplates } from "../../_lib/templateSocial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A creator page (Phase 3, extended with Follow/counts) — display name, follower/following/total-like
 *  counts, whether the CURRENT viewer already follows them, and two grids: everything they've PUBLISHED
 *  (`listPublicTemplatesByOwner` — never their private work, even for themselves visiting their own
 *  page) and every public template they've themselves LIKED (`listLikedPublicTemplates` — see that
 *  function's own doc comment on why a private/unpublished like never leaks here). Genuinely public
 *  (`publicSessionRoute`) — reachable by tapping a name from the anonymous `/t/[id]` share page, not
 *  just from inside the signed-in app; `viewerIsFollowing` is simply `false` for an anonymous visitor
 *  (nothing to have followed as). A creator with zero published templates still returns 200 with an
 *  empty list (not 404) — there's nothing invalid about that state, unlike a template id that's private
 *  or doesn't exist at all.
 *
 *  `[id]` accepts either the raw Supabase auth UUID (every existing shared link, still works forever) or
 *  a username (`resolveProfileIdFromUrlSegment`) — the readable form new profiles get once they set one.
 *  Either way this resolves down to the real user id before doing anything else, so every OTHER lookup
 *  below never needs to know which shape the URL came in as. */
export const GET = publicSessionRoute(async (_req, user, context: { params: Promise<{ id: string }> }) => {
  const { id: segment } = await context.params;
  const id = await resolveProfileIdFromUrlSegment(segment);
  if (!id) throw new ApiError(404, "No such creator", "creator-not-found");
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
  const toRow = (t: { id: string; name: string; updatedAt: string; isPublic: boolean; ownerId: string; project: TemplateProjectData }) => ({
    id: t.id,
    name: t.name,
    updatedAt: t.updatedAt,
    isPublic: t.isPublic,
    ownerId: t.ownerId,
    aiCredits: templateAiCredits(t.project),
  });
  return withCors(Response.json({
    id,
    displayName: profile.displayName,
    username: profile.username,
    bio: profile.bio,
    avatarUrl: profile.avatarPath ? `/api/vcut/creators/${id}/avatar?v=${profile.avatarPath}` : null,
    followerCount,
    followingCount,
    totalLikes,
    viewerIsFollowing,
    templates: templates.map(toRow),
    likedTemplates: likedTemplates.map(toRow),
  }));
});

export { corsPreflight as OPTIONS } from "../../_lib/localOnly";
