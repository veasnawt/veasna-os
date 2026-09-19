import { corsPreflight, hostedOnlyRoute } from "../../_lib/localOnly";
import { getPublicProfiles } from "../../_lib/profiles";
import { listPublicTemplates } from "../../_lib/templates";
import { getCommentCounts, getLikeCounts, getLikedSet } from "../../_lib/templateSocial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The "Discover" feed — every OTHER user's published template (`listPublicTemplates`'s own doc
 *  comment covers the exclude-your-own reasoning). Deliberately NOT `requirePro`-gated, unlike every
 *  other route in this file: a Free-plan viewer can browse and start a project from a published
 *  template — only PUBLISHING your own stays Pro-only (`templates/[id]/route.ts`'s own PATCH handler),
 *  a deliberate product decision, not an oversight. Still `hostedOnlyRoute` — genuinely public (no
 *  auth at all) is a bigger, separate decision than this feature has made yet.
 *
 *  Phase 3 attaches each row's own creator name and like/comment counts here, in the SAME response —
 *  the grid needs "by so-and-so" attribution and a like count on every tile, and batching it into this
 *  one list call (`getPublicProfiles`/`getLikeCounts`/`getCommentCounts` all take the WHOLE id list at
 *  once) is one extra round trip total, not one per tile. */
export const GET = hostedOnlyRoute(async (_req, user) => {
  const templates = await listPublicTemplates(user.id);
  const ids = templates.map((t) => t.id);
  const [profiles, likeCounts, commentCounts, likedSet] = await Promise.all([
    getPublicProfiles(templates.map((t) => t.ownerId)),
    getLikeCounts(ids),
    getCommentCounts(ids),
    getLikedSet(ids, user.id),
  ]);
  const rows = templates.map((t) => ({
    ...t,
    creatorDisplayName: profiles.get(t.ownerId)?.displayName ?? null,
    likeCount: likeCounts.get(t.id) ?? 0,
    commentCount: commentCounts.get(t.id) ?? 0,
    viewerHasLiked: likedSet.has(t.id),
  }));
  return Response.json({ templates: rows });
});

// Desktop/mobile call this cross-origin (`centralAuthFetch`/`client.ts`'s own central routing — see
// each platform's own doc comments on why templates only ever live on the hosted deployment). The
// `Authorization` header those callers attach makes this a non-simple CORS request, so the browser
// sends a real preflight OPTIONS first — `hostedOnlyRoute` already puts CORS headers on the GET's own
// response via `withCors`, but that alone doesn't answer the preflight itself; without this, the
// preflight has no CORS headers of its own, fails, and the real GET never fires at all (surfaces as a
// bare "Failed to fetch," not a 401/403 — confirmed as a real, reported bug on desktop's own packaged
// build, not theoretical). Same fix `stock/route.ts`/`ai-image/route.ts` already needed for the
// identical reason.
export const OPTIONS = corsPreflight;
