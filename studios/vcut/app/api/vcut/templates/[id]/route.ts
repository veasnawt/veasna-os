import { corsPreflight, hostedOnlyRoute, publicSessionRoute, withCors } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";
import { getPublicProfile } from "../../_lib/profiles";
import { getCommentCounts, getLikeCounts, getLikedSet } from "../../_lib/templateSocial";
import { getViewableTemplate, requirePro, setTemplatePublic } from "../../_lib/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One template's own public-facing metadata — name, creator, like/comment counts, and (only for a
 *  signed-in viewer) whether THEY have already liked it. Genuinely optional auth (`publicSessionRoute`,
 *  not `hostedOnlyRoute`): this is the one piece of template data the public `/t/[id]` share page needs
 *  for an anonymous visitor (Phase 3's own "no sign-in required" decision), and also what the in-app
 *  Discover/viewer UI calls as a signed-in user — same route, same `getViewableTemplate` visibility
 *  check either way (an empty-string viewer id can never match a real owner_id, so it naturally
 *  degrades to "must be public" for an anonymous request). */
const getTemplate = publicSessionRoute(async (_req, user, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const template = await getViewableTemplate(id, user?.id ?? "");
  const [creator, likeCounts, commentCounts, likedSet] = await Promise.all([
    getPublicProfile(template.ownerId),
    getLikeCounts([id]),
    getCommentCounts([id]),
    getLikedSet([id], user?.id ?? null),
  ]);
  return Response.json({
    id,
    name: template.name,
    isPublic: template.isPublic,
    ownerId: template.ownerId,
    creatorDisplayName: creator.displayName,
    likeCount: likeCounts.get(id) ?? 0,
    commentCount: commentCounts.get(id) ?? 0,
    viewerHasLiked: likedSet.has(id),
  });
});

// `publicSessionRoute` (deliberately — see this route's own doc comment above) adds no CORS handling of
// its own, unlike `hostedOnlyRoute`'s automatic `withCors`. Desktop/mobile call this cross-origin like
// every other template route, so both the response AND the preflight need it added explicitly here —
// see `templates/discover/route.ts`'s own doc comment on the identical preflight gap.
export const GET = async (req: Request, context: { params: Promise<{ id: string }> }) => withCors(await getTemplate(req, context));

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

export const OPTIONS = corsPreflight;
