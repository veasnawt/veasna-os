import type Stripe from "stripe";
import { upsertPlanByStripeCustomerId } from "../../_lib/profiles";
import { getStripe } from "../../_lib/stripe";
import { VCUT_HOSTED } from "../../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe calls this directly — there is no user session here at all, and deliberately no
 *  `hostedOnlyRoute`/`requireSessionUser` wrapper (both expect a bearer token no webhook request will
 *  ever carry). The signature check below is the ENTIRE authentication story: it's what proves a
 *  request claiming "this customer's subscription changed" actually came from Stripe and not from
 *  anyone who discovered this URL. Never skip it, and never `req.json()` before it — the signature is
 *  computed over the EXACT raw request body bytes, which `req.json()` would have already consumed and
 *  reserialized (subtly differently) by the time this got to it. */
export async function POST(req: Request): Promise<Response> {
  if (!VCUT_HOSTED) return Response.json({ error: "Not available outside the hosted web deployment." }, { status: 404 });

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return Response.json({ error: "Missing webhook signature or secret" }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[vcut] Stripe webhook signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    // Fires once, right after a checkout completes — the subscription itself (and its
    // `current_period_end`) is what `customer.subscription.updated` (below) reports, which Stripe
    // also always sends around the same time as this event. Nothing to write here beyond confirming
    // the customer id `checkout/route.ts` already saved actually matches what Stripe has on file.
    case "checkout.session.completed":
      break;

    // The one event type that actually carries `plan`/`current_period_end` — fires on the initial
    // subscription creation AND every renewal/plan change afterward, so this single handler covers
    // both "just subscribed" and "still subscribed, renewed for another period."
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      const isActive = subscription.status === "active" || subscription.status === "trialing";
      const periodEnd = subscription.items.data[0]?.current_period_end;
      await upsertPlanByStripeCustomerId(customerId, isActive ? "pro" : "free", periodEnd ? new Date(periodEnd * 1000).toISOString() : null);
      break;
    }

    // Cancellation (immediate, or Stripe's own end-of-period cancellation finally taking effect) —
    // drops back to free rather than leaving a stale `current_period_end` a client might misread as
    // still-valid.
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      await upsertPlanByStripeCustomerId(customerId, "free", null);
      break;
    }

    default:
      // Every other event type Stripe might send (invoice.*, payment_intent.*, ...) is outside what
      // this app tracks — acknowledging with 200 either way tells Stripe not to retry an event it
      // was never going to do anything with.
      break;
  }

  return Response.json({ received: true });
}
