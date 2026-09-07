import { getProfile, setStripeCustomerId } from "../../_lib/profiles";
import { getProPriceId, getStripe, HOSTED_ORIGIN } from "../../_lib/stripe";
import { corsPreflight, hostedOnlyRoute } from "../../_lib/localOnly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

/** Starts (or resumes) a Stripe Checkout session for the signed-in user's VCut Pro subscription.
 *  Creating the Stripe customer here — not eagerly at sign-up — means a user who never upgrades never
 *  gets a Stripe customer object at all, keeping the "who exists in Stripe" set exactly matched to
 *  "who has ever started a checkout," which is what `webhook/route.ts`'s customer-id lookup relies on.
 *  Returns a redirect URL rather than redirecting itself — the caller (`packages/vcut/src/api/
 *  billing.ts`'s `startCheckout`) is a `fetch` from client code, which navigates the browser to it. */
export const POST = hostedOnlyRoute(async (_req, user) => {
  const stripe = getStripe();
  const existing = await getProfile(user.id);

  let customerId = existing?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await setStripeCustomerId(user.id, customerId);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: getProPriceId(), quantity: 1 }],
    success_url: `${HOSTED_ORIGIN}/account?checkout=success`,
    cancel_url: `${HOSTED_ORIGIN}/account?checkout=cancelled`,
  });

  return Response.json({ url: session.url });
});
