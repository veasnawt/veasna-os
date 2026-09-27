import { hostedOnlyRoute } from "../../_lib/localOnly";
import { isUsernameAvailable, isValidUsername, normalizeUsername } from "../../_lib/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live "is this taken?" check for the username field on `/me` — read-only, no write. `excludeSelf`
 *  (via `isUsernameAvailable`'s own `excludeUserId`) so a user typing toward their OWN current username
 *  never sees it reported as taken. `valid: false` for anything that fails the format check at all
 *  (`isUsernameAvailable` itself already returns `false` for that case, so `available` alone is already
 *  correct either way — `valid` is split out purely so the client can show "too short"/"bad characters"
 *  instead of a misleading "already taken" for a malformed candidate that was never going to collide
 *  with anything). */
export const GET = hostedOnlyRoute(async (req, user) => {
  const raw = new URL(req.url).searchParams.get("u") ?? "";
  const username = normalizeUsername(raw);
  const valid = isValidUsername(username);
  const available = valid ? await isUsernameAvailable(username, user.id) : false;
  return Response.json({ username, valid, available });
});

export { corsPreflight as OPTIONS } from "../../_lib/localOnly";
