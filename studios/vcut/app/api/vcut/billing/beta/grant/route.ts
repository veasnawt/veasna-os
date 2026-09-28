import { corsPreflight, hostedOnlyRoute } from "../../../_lib/localOnly";
import { ApiError } from "../../../_lib/paths";
import { syncCanonicalSubscription, grantCreditsIdempotent, resolveUserEntitlements } from "../../../_lib/billingCore";
import { getCreditsStatus } from "../../../_lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

/** Complimentary Beta Entitlement Handler
 *  Provides a secure server-gated beta trial for mobile beta testers.
 *  - Gated by environment variable `VCUT_BETA_BILLING_MODE === "complimentary_beta"`.
 *  - Grants a strictly finite, configurable credit allotment (default 300) — NEVER unlimited.
 *  - Sets finite expiration (default 30 days).
 *  - Enforces single-claim idempotency per user account.
 *  - Isolated under provider 'beta' / environment 'test' to prevent contaminating production revenue records. */
export const POST = hostedOnlyRoute(async (_req, user) => {
  const betaMode = process.env.VCUT_BETA_BILLING_MODE;
  if (betaMode !== "complimentary_beta") {
    throw new ApiError(403, "Complimentary beta entitlements are not enabled on this deployment", "beta-mode-disabled");
  }

  const durationDays = parseInt(process.env.VCUT_BETA_DURATION_DAYS || "30", 10);
  const creditsAllotment = parseInt(process.env.VCUT_BETA_CREDITS_ALLOTMENT || "300", 10);

  const now = Date.now();
  const expiryIso = new Date(now + durationDays * 24 * 60 * 60 * 1000).toISOString();
  const txId = `beta_grant_${user.id}`;

  // 1. Grant finite beta credits idempotently (prevents repeatedly claiming credits)
  const grantResult = await grantCreditsIdempotent({
    userId: user.id,
    amount: creditsAllotment,
    provider: "beta",
    transactionId: txId,
    productId: "vcut_beta_trial",
    type: "beta_grant",
    rawData: { grantedAt: new Date(now).toISOString(), durationDays, allotment: creditsAllotment },
  });

  // 2. Grant temporary beta Pro subscription
  const entitlement = await syncCanonicalSubscription({
    userId: user.id,
    provider: "beta",
    providerSubscriptionId: `beta_sub_${user.id}`,
    status: "active",
    productId: "vcut_beta_trial",
    currentPeriodStart: new Date(now).toISOString(),
    currentPeriodEnd: expiryIso,
    cancelAtPeriodEnd: false,
    environment: "test",
    rawData: { betaMode: true, durationDays },
  });

  const credits = await getCreditsStatus(user.id);

  return Response.json({
    success: true,
    isPro: entitlement.isPro,
    plan: entitlement.plan,
    currentPeriodEnd: entitlement.currentPeriodEnd,
    creditsRemaining: credits.remaining,
    alreadyClaimed: grantResult.alreadyProcessed,
    message: grantResult.alreadyProcessed
      ? "Beta entitlement already claimed for this account"
      : `Granted ${creditsAllotment} beta credits valid for ${durationDays} days`,
  });
});
