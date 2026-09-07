import Stripe from "stripe";
import { ApiError } from "./paths";

/** The one canonical hosted origin every billing redirect (`success_url`/`cancel_url`/`return_url`)
 *  points back to — deliberately NOT derived from the incoming request's own `req.url`/Host header,
 *  which a real production request confirmed resolves to the container's internal bind address
 *  (`http://0.0.0.0:8080`) rather than the public domain: Railway's proxy doesn't forward enough
 *  info for Next's own URL reconstruction to recover `https://vcut.io` here. These routes only ever
 *  run on this one deployment anyway (`hostedOnlyRoute` already refuses to run anywhere else), so a
 *  hardcoded constant is simpler and more correct than trying to fix proxy-header trust for one
 *  narrow use — matches `packages/vcut/src/api/billing.ts`'s own `BILLING_ORIGIN` for the identical
 *  reason on the client side. */
export const HOSTED_ORIGIN = "https://vcut.io";

/** Lazily created and memoized — same reasoning as `packages/auth/src/server.ts`'s
 *  `getSupabaseAdminClient`: importing this module has no effect (and doesn't require
 *  `STRIPE_SECRET_KEY` to even be set) until a billing route actually calls in. Throws rather than
 *  returning `null` — every caller is already behind `hostedOnlyRoute`, so a missing key here is a
 *  real deployment misconfiguration to fail loudly on, not a normal "billing isn't a thing here"
 *  state the way an unconfigured desktop/mobile build is for `packages/auth`'s browser client. */
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new ApiError(500, "STRIPE_SECRET_KEY is not set", "stripe-not-configured");
  cached = new Stripe(secretKey);
  return cached;
}

/** The one recurring Price a checkout session subscribes a customer to — set as a Railway variable
 *  alongside `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` (see the Stripe dashboard: Product catalog →
 *  "VCut Pro" → the Price's own id, `price_...`), never hardcoded here since it differs between
 *  Stripe's test mode and live mode. */
export function getProPriceId(): string {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new ApiError(500, "STRIPE_PRICE_ID is not set", "stripe-not-configured");
  return priceId;
}
