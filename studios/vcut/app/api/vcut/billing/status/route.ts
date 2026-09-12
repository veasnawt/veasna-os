import { getCreditsStatus } from "../../_lib/credits";
import { getProfile } from "../../_lib/profiles";
import { corsPreflight, hostedOnlyRoute } from "../../_lib/localOnly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

/** The one endpoint every platform (web, desktop, mobile — see `packages/vcut/src/api/billing.ts`'s
 *  `getBillingStatus`) calls to answer "is this signed-in user currently Pro, and how many credits do
 *  they have left?" No profile row at all (never started a checkout, never used a credit-gated
 *  feature) reports the same `plan: "free"` a lapsed subscriber's real row would — callers never need
 *  to distinguish "never subscribed" from "subscribed once, no longer." Credits come from
 *  `getCreditsStatus`, a plain read — this never spends anything itself (only `hostedCreditGatedRoute`
 *  does, at the moment a credit-gated feature actually runs).
 *
 *  `getProfile`/`getCreditsStatus` run independently (`Promise.allSettled`, not `Promise.all`) — a
 *  real, confirmed bug: the two used to be awaited together, so a transient failure in the CREDITS
 *  read alone (a genuine, if rare, Supabase hiccup — see `getCreditsStatus`'s own new error logging)
 *  threw the whole request out, even though `profile` had already resolved correctly. The client's own
 *  `getBillingStatus` treats any failure here as `plan: "free"` (see its own doc comment), so a real
 *  Pro user hitting that credits blip saw themselves reported as free — concretely, the free-only
 *  outro end card (`showOutroMarker` in `Preview.tsx`/`Timeline.tsx`) appearing in their editor even
 *  though their actual export (server-side, `shouldIncludeOutro`, its own independent `getProfile`
 *  call) was never affected. A credits failure now only degrades the credits HALF of the response
 *  (reported as 0 remaining — the same fail-closed choice `getCreditsStatus`'s own doc comment already
 *  makes for a user with no profile row at all), never the plan half. */
export const GET = hostedOnlyRoute(async (_req, user) => {
  const [profileResult, creditsResult] = await Promise.allSettled([getProfile(user.id), getCreditsStatus(user.id)]);
  const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
  if (profileResult.status === "rejected") {
    console.error("[vcut] billing/status: could not read profile for", user.id, profileResult.reason);
  }
  const credits =
    creditsResult.status === "fulfilled" ? creditsResult.value : { remaining: 0, resetAt: new Date().toISOString() };
  return Response.json({
    plan: profile?.plan ?? "free",
    currentPeriodEnd: profile?.currentPeriodEnd ?? null,
    creditsRemaining: credits.remaining,
    creditsResetAt: credits.resetAt,
  });
});
