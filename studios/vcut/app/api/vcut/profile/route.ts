import { hostedOnlyRoute } from "../_lib/localOnly";
import { ApiError } from "../_lib/paths";
import { getPublicProfile, setProfileIdentity } from "../_lib/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Your own creator display name and username (Phase 3, extended with usernames) — the profile identity
 *  a user can set themselves, separate from `billing/status` (plan/credits) since this has nothing to do
 *  with billing. */
export const GET = hostedOnlyRoute(async (_req, user) => {
  const profile = await getPublicProfile(user.id);
  return Response.json({ displayName: profile.displayName, username: profile.username });
});

/** `{ displayName?: string, username?: string }` — either or both; only the fields present are written.
 *  `displayName` is shown on Discover tiles, the full-screen viewer's action rail, and the public
 *  `/t/[id]`/`/u/[id]` pages for anything this user publishes. Trimmed and length-capped the same way a
 *  comment body is (`addComment`) — free-text user content. Empty after trimming clears it back to
 *  `null` (falls back to a generic label everywhere it's shown) rather than storing an empty string.
 *  `username` goes through `setUsername`'s own validation/normalization/unique-violation handling —
 *  unlike `displayName` it can't be cleared back to null once set (no product need expressed for
 *  "give up your username," and the readable `/u/<username>` URL it backs would otherwise dangle). */
export const PATCH = hostedOnlyRoute(async (req, user) => {
  const body = (await req.json().catch(() => ({}))) as { displayName?: string; username?: string };
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Invalid profile", "invalid-profile");
  }
  if (body.displayName === undefined && body.username === undefined) {
    throw new ApiError(400, "Nothing to update", "missing-fields");
  }
  await setProfileIdentity(user.id, body);
  const profile = await getPublicProfile(user.id);
  return Response.json({ displayName: profile.displayName, username: profile.username });
});
