import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import { FREE_CREDITS_PER_MONTH, PRO_CREDITS_PER_MONTH } from "./credits";
import { ApiError } from "./paths";

export type Plan = "free" | "pro";

export interface Profile {
  stripeCustomerId: string | null;
  plan: Plan;
  currentPeriodEnd: string | null;
}

/** `null` means no row exists yet — a user who has never started a checkout. Treated identically to
 *  `{plan: "free", ...}` by every caller (see `status/route.ts`): a `profiles` row is only ever
 *  created by `setStripeCustomerId` below, the first time someone actually starts a checkout, not
 *  eagerly for every signed-up user. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("stripe_customer_id, plan, current_period_end")
    .eq("id", userId)
    .maybeSingle();
  // Logged before throwing — same "confirmed swallowed-error bug" category `getCreditsStatus`
  // (`_lib/credits.ts`) and `upsertPlanByStripeCustomerId` (below) both already document: a real
  // failure here used to reach the client as a generic 500 with nothing in the server logs
  // explaining WHY the query itself failed (a paused/unreachable Supabase project, a transient
  // connection error, or a real schema problem all look identical without this).
  if (error) {
    console.error("[vcut] profiles: could not read profile for", userId, error);
    throw new ApiError(500, "Could not read billing profile", "profile-read-failed");
  }
  if (!data) return null;
  return { stripeCustomerId: data.stripe_customer_id, plan: data.plan as Plan, currentPeriodEnd: data.current_period_end };
}

/** Called once per user, from `checkout/route.ts`, the first time they start a checkout with no
 *  existing Stripe customer — an upsert (not insert) since a row might already exist with `plan`
 *  already set from a PRIOR subscription that later lapsed back to free; this must never clobber
 *  that, only fill in the customer id. `plan` deliberately isn't touched here — see this table's own
 *  migration comment on why only the webhook is allowed to change it. */
export async function setStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("profiles").upsert({ id: userId, stripe_customer_id: stripeCustomerId }, { onConflict: "id" });
  if (error) throw new ApiError(500, "Could not save Stripe customer", "profile-write-failed");
}

/** The only place `plan`/`current_period_end` are ever written — called from `webhook/route.ts` after
 *  Stripe's own signature verification confirms the event is real. Addressed by `stripeCustomerId`
 *  (not a Supabase user id — a Stripe event carries the former, not the latter) against the unique
 *  index the migration puts on that column. A webhook for a customer with no matching row (shouldn't
 *  happen — `checkout/route.ts` always creates the row before Stripe could ever charge that customer,
 *  but a manually-created Stripe customer or a race is possible) is a no-op rather than an error: there
 *  is nothing here to associate the plan change with.
 *
 *  Also the one place credits get an IMMEDIATE top-up rather than waiting for `spend_credits`'s own
 *  lazy refill (see that function's doc comment) — tied to the real Stripe billing period, not a
 *  generic "1 month from whenever" clock. Only tops up `pro` when `currentPeriodEnd` actually
 *  CHANGED from what's already stored — Stripe can send `customer.subscription.updated` for reasons
 *  unrelated to a renewal (a payment method update, for instance), and re-topping-up credits on every
 *  such event (rather than only on an actual new billing period starting) would be a real, if minor,
 *  exploitable perk. A downgrade to `free` resets to the free allotment immediately — a clean slate,
 *  not stale Pro-scale numbers sitting there until they naturally lapse. */
export async function upsertPlanByStripeCustomerId(stripeCustomerId: string, plan: Plan, currentPeriodEnd: string | null): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("current_period_end")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  // Logged, not thrown — `webhook/route.ts` still needs to return 200 either way (Stripe retries a
  // non-2xx response indefinitely, which would just repeat whatever went wrong here), but a real
  // read/write failure silently swallowed here was a genuine, confirmed bug: a live account's plan
  // updated to "pro" correctly while credits stayed stuck at the free allotment, with NOTHING in the
  // logs to explain why until this logging was added.
  if (selectError) {
    console.error("[vcut] webhook: could not read existing profile for", stripeCustomerId, selectError);
  }

  const update: Record<string, unknown> = { plan, current_period_end: currentPeriodEnd, updated_at: new Date().toISOString() };
  if (plan === "pro" && currentPeriodEnd && currentPeriodEnd !== existing?.current_period_end) {
    update.credits_remaining = PRO_CREDITS_PER_MONTH;
    update.credits_reset_at = currentPeriodEnd;
  } else if (plan === "free") {
    update.credits_remaining = FREE_CREDITS_PER_MONTH;
    update.credits_reset_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  const { error: updateError, count } = await supabase
    .from("profiles")
    .update(update, { count: "exact" })
    .eq("stripe_customer_id", stripeCustomerId);
  if (updateError) {
    console.error("[vcut] webhook: profile update failed for", stripeCustomerId, updateError);
  } else if (!count) {
    // Matched zero rows — the row hadn't picked up this Stripe customer id yet (a real, if rare, race
    // between `checkout/route.ts`'s own write and this webhook arriving), or it was manually created
    // in Stripe with no matching Supabase user at all. Either way, silently "succeeding" at updating
    // nothing is exactly the shape of failure that went unnoticed before this log line existed.
    console.error("[vcut] webhook: no profile row matched stripe_customer_id", stripeCustomerId, "— update had no effect");
  }
}
