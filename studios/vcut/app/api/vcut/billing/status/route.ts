import { getCreditsStatus } from "../../_lib/credits";
import { resolveUserEntitlements } from "../../_lib/billingCore";
import { corsPreflight, hostedOnlyRoute } from "../../_lib/localOnly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

/** The one endpoint every platform (web, desktop, mobile) calls to answer:
 *  "Is this signed-in user currently Pro (via Stripe, Google Play, or Apple), and how many credits do they have?"
 *  Resolves through the canonical entitlement engine. */
export const GET = hostedOnlyRoute(async (_req, user) => {
  const [entitlementResult, creditsResult] = await Promise.allSettled([
    resolveUserEntitlements(user.id),
    getCreditsStatus(user.id),
  ]);
  const entitlement = entitlementResult.status === "fulfilled" ? entitlementResult.value : null;
  if (entitlementResult.status === "rejected") {
    console.error("[vcut] billing/status: could not resolve entitlements for", user.id, entitlementResult.reason);
  }
  const credits =
    creditsResult.status === "fulfilled" ? creditsResult.value : { remaining: 0, resetAt: new Date().toISOString() };
  return Response.json({
    plan: entitlement?.plan ?? "free",
    provider: entitlement?.activeProvider ?? null,
    currentPeriodEnd: entitlement?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: entitlement?.cancelAtPeriodEnd ?? false,
    creditsRemaining: credits.remaining,
    creditsResetAt: credits.resetAt,
  });
});
