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
 *  does, at the moment a credit-gated feature actually runs). */
export const GET = hostedOnlyRoute(async (_req, user) => {
  const [profile, credits] = await Promise.all([getProfile(user.id), getCreditsStatus(user.id)]);
  return Response.json({
    plan: profile?.plan ?? "free",
    currentPeriodEnd: profile?.currentPeriodEnd ?? null,
    creditsRemaining: credits.remaining,
    creditsResetAt: credits.resetAt,
  });
});
