import { publicSessionRoute } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";
import { getPublicProfile } from "../../_lib/profiles";
import { listPublicTemplatesByOwner } from "../../_lib/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every real `id` here is a Supabase auth user id (a uuid) — reachable only via an `ownerId` this app
 *  itself already produced (Discover, the viewer's action rail, `/t/[id]`'s own creator link). A
 *  malformed one only ever shows up from someone hand-editing the URL, but Postgres itself rejects a
 *  non-uuid string against a `uuid` column with a hard error, not an empty result — confirmed live
 *  (`/api/vcut/creators/not-a-real-id` 500'd instead of 404ing) — so this checks the shape first and
 *  answers the same clean "not found" a real, nonexistent creator already gets. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A minimal creator page (Phase 3) — this creator's own display name plus a grid of everything
 *  they've PUBLISHED (`listPublicTemplatesByOwner` — never their private work, even for themselves
 *  visiting their own page, see that function's own doc comment). Genuinely public
 *  (`publicSessionRoute`) — reachable by tapping a name from the anonymous `/t/[id]` share page, not
 *  just from inside the signed-in app. A creator with zero published templates still returns 200 with
 *  an empty list (not 404) — there's nothing invalid about that state, unlike a template id that's
 *  private or doesn't exist at all. */
export const GET = publicSessionRoute(async (_req, _user, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) throw new ApiError(404, "No such creator", "creator-not-found");
  const [profile, templates] = await Promise.all([getPublicProfile(id), listPublicTemplatesByOwner(id)]);
  return Response.json({
    id,
    displayName: profile.displayName,
    templates: templates.map((t) => ({ id: t.id, name: t.name, updatedAt: t.updatedAt, isPublic: t.isPublic, ownerId: t.ownerId })),
  });
});
