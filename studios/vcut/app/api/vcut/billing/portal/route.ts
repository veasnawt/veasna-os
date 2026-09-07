import { getProfile } from "../../_lib/profiles";
import { getStripe, HOSTED_ORIGIN } from "../../_lib/stripe";
import { corsPreflight, hostedOnlyRoute } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

/** Opens Stripe's own hosted Customer Portal — where a subscriber manages their payment method,
 *  switches plans, or cancels, none of which VCut needs to build UI for itself. Requires an existing
 *  Stripe customer (created by `checkout/route.ts` the first time this user ever subscribed); a user
 *  who has never done that has nothing to manage yet, so this 400s rather than silently creating one
 *  — unlike checkout, there's no sensible "first subscription" flow to fall into from here. */
export const POST = hostedOnlyRoute(async (_req, user) => {
  const profile = await getProfile(user.id);
  if (!profile?.stripeCustomerId) {
    throw new ApiError(400, "No billing account yet — start a checkout first", "no-stripe-customer");
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: profile.stripeCustomerId,
    return_url: `${HOSTED_ORIGIN}/account`,
  });

  return Response.json({ url: session.url });
});
