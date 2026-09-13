import { hostedOnlyRoute } from "../_lib/localOnly";
import { ApiError } from "../_lib/paths";
import { getPublicProfile, setDisplayName } from "../_lib/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Your own creator display name (Phase 3) — the one piece of profile identity a user can set
 *  themselves, separate from `billing/status` (plan/credits) since this has nothing to do with
 *  billing. */
export const GET = hostedOnlyRoute(async (_req, user) => {
  const profile = await getPublicProfile(user.id);
  return Response.json({ displayName: profile.displayName });
});

/** `{ displayName: string }` — shown on Discover tiles, the full-screen viewer's action rail, and the
 *  public `/t/[id]`/`/u/[id]` pages for anything this user publishes. Trimmed and length-capped the same
 *  way a comment body is (`addComment`) — a display name is just as much free-text user content. Empty
 *  after trimming clears it back to `null` (falls back to a generic label everywhere it's shown) rather
 *  than storing an empty string. */
export const PATCH = hostedOnlyRoute(async (req, user) => {
  const body = (await req.json().catch(() => ({}))) as { displayName?: string };
  if (typeof body.displayName !== "string") throw new ApiError(400, "Missing displayName", "missing-display-name");
  const trimmed = body.displayName.trim().slice(0, 60) || null;
  await setDisplayName(user.id, trimmed);
  return Response.json({ displayName: trimmed });
});
