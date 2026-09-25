import type Stripe from "stripe";
import { derivePlan } from "../../_lib/billingPlan";
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

    // Any subscription event — created, updated, deleted — means "this customer's subscription state changed".
    // Stripe does NOT guarantee delivery order (or once-only delivery), and trusting each event's own payload
    // let a late `updated` (active) that arrived AFTER `deleted` put a cancelled user back on Pro. So the event
    // is only a trigger: the plan is derived from the customer's CURRENT subscriptions, fetched from Stripe
    // right now, which is the same answer whatever order events land in and however many times one is
    // redelivered (`derivePlan` / `buildPlanUpdate` in `_lib/billingPlan.ts`).
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      try {
        const subscriptions = await getStripe().subscriptions.list({ customer: customerId, status: "all", limit: 20 });
        const { plan, currentPeriodEnd } = derivePlan(
          subscriptions.data.map((s) => ({ status: s.status, currentPeriodEnd: s.items.data[0]?.current_period_end ?? null }))
        );
        const applied = await upsertPlanByStripeCustomerId(customerId, plan, currentPeriodEnd);
        // A 5xx makes Stripe redeliver (with backoff, for days). That is what we want when the row wasn't
        // there yet (a webhook racing `checkout`'s own write of the customer id) or the write failed — the
        // old handler answered 200 and the plan change was lost for good.
        if (!applied) return Response.json({ error: "Could not apply the plan change yet" }, { status: 500 });
      } catch (err) {
        console.error("[vcut] webhook: could not resolve subscription state for", customerId, err);
        return Response.json({ error: "Could not resolve subscription state" }, { status: 500 });
      }
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
