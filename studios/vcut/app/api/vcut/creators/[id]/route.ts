import { publicSessionRoute } from "../../_lib/localOnly";
import { getPublicProfile } from "../../_lib/profiles";
import { listPublicTemplatesByOwner } from "../../_lib/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A minimal creator page (Phase 3) — this creator's own display name plus a grid of everything
 *  they've PUBLISHED (`listPublicTemplatesByOwner` — never their private work, even for themselves
 *  visiting their own page, see that function's own doc comment). Genuinely public
 *  (`publicSessionRoute`) — reachable by tapping a name from the anonymous `/t/[id]` share page, not
 *  just from inside the signed-in app. A creator with zero published templates still returns 200 with
 *  an empty list (not 404) — there's nothing invalid about that state, unlike a template id that's
 *  private or doesn't exist at all. */
export const GET = publicSessionRoute(async (_req, _user, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const [profile, templates] = await Promise.all([getPublicProfile(id), listPublicTemplatesByOwner(id)]);
  return Response.json({
    id,
    displayName: profile.displayName,
    templates: templates.map((t) => ({ id: t.id, name: t.name, updatedAt: t.updatedAt, isPublic: t.isPublic, ownerId: t.ownerId })),
  });
});
