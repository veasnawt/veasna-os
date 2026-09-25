import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import { FREE_CREDITS_PER_MONTH, PRO_CREDITS_PER_MONTH } from "./credits";
import { buildPlanUpdate } from "./billingPlan";
import { ApiError } from "./paths";

export type Plan = "free" | "pro";

export interface Profile {
  stripeCustomerId: string | null;
  plan: Plan;
  currentPeriodEnd: string | null;
}

/** A short, non-billing slice of `profiles` safe to hand to ANY viewer — Phase 3's creator identity
 *  (Discover tiles, the full-screen viewer's action rail, the public `/t/[id]` share page, `/u/[id]`'s
 *  own creator page). Deliberately excludes everything `getProfile` exposes (`plan`, Stripe ids) — those
 *  are the OWNER's own business, never another viewer's. `displayName` is `null` for anyone who's never
 *  set one — every caller falls back to a generic label ("A VCut creator") rather than showing a raw
 *  user id, the same "absent is a normal, handled state" the column's own migration comment expects. */
export interface PublicProfile {
  id: string;
  displayName: string | null;
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
/** Batch lookup for a set of template owners at once — Discover's own feed and a template's info route
 *  both need "whose name goes under this tile" for potentially dozens of rows in one request; a
 *  `.select().eq()` per row would be dozens of round trips for what a single `.in()` query answers in
 *  one. A user id missing from the result (never having touched `profiles` at all — see `getProfile`'s
 *  own doc comment on why that row is created lazily, not eagerly) just means `displayName: null`, the
 *  same "not set yet" case any other row already returns via this shape. */
export async function getPublicProfiles(userIds: string[]): Promise<Map<string, PublicProfile>> {
  const unique = [...new Set(userIds)];
  const result = new Map<string, PublicProfile>();
  if (unique.length === 0) return result;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("profiles").select("id, display_name").in("id", unique);
  if (error) {
    console.error("[vcut] profiles: could not batch-read display names for", unique, error);
    return result;
  }
  for (const row of data ?? []) result.set(row.id, { id: row.id, displayName: row.display_name });
  return result;
}

export async function getPublicProfile(userId: string): Promise<PublicProfile> {
  const profiles = await getPublicProfiles([userId]);
  return profiles.get(userId) ?? { id: userId, displayName: null };
}

/** The one write path for a user's own display name — a plain upsert (not `setStripeCustomerId`'s own
 *  "must never clobber a plan a webhook already set" concern; nothing else in `profiles` depends on
 *  when this row first appears). Called from `profile/route.ts`'s own PATCH, itself the only thing
 *  allowed to set this: `profiles` still has NO client-facing update RLS policy at all — same posture
 *  the table's own original migration comment established for `plan` — enforced here by going through
 *  the service-role client from a route that itself requires a real session, not by loosening RLS. */
export async function setDisplayName(userId: string, displayName: string | null): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("profiles").upsert({ id: userId, display_name: displayName }, { onConflict: "id" });
  if (error) throw new ApiError(500, "Could not save your name", "profile-write-failed");
}

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
 *  but a manually-created Stripe customer or a race is possible) writes nothing and returns `false`: there
 *  is nothing here to associate the plan change with yet, and the webhook answers 5xx so Stripe retries
 *  once the row exists. Returns `true` only when a row was actually updated.
 *
 *  Also the one place credits get an IMMEDIATE top-up rather than waiting for `spend_credits`'s own
 *  lazy refill (see that function's doc comment) — tied to the real Stripe billing period, not a
 *  generic "1 month from whenever" clock. Only tops up `pro` when `currentPeriodEnd` actually
 *  CHANGED from what's already stored — Stripe can send `customer.subscription.updated` for reasons
 *  unrelated to a renewal (a payment method update, for instance), and re-topping-up credits on every
 *  such event (rather than only on an actual new billing period starting) would be a real, if minor,
 *  exploitable perk. A downgrade to `free` resets to the free allotment immediately — a clean slate,
 *  not stale Pro-scale numbers sitting there until they naturally lapse. */
export async function upsertPlanByStripeCustomerId(stripeCustomerId: string, plan: Plan, currentPeriodEnd: string | null): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("plan, current_period_end")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  // Logged and reported through the return value rather than thrown: the webhook turns `false` into a 5xx
  // so Stripe redelivers (the old handler answered 200 regardless and a failed write was lost for good — a
  // real, confirmed bug: a live account's plan updated to "pro" while credits stayed stuck at the free
  // allotment, with nothing surfacing it).
  if (selectError) {
    console.error("[vcut] webhook: could not read existing profile for", stripeCustomerId, selectError);
    return false;
  }

  // Credits are only touched on a genuine new Pro period or a Pro -> free downgrade — see `buildPlanUpdate`.
  const update = buildPlanUpdate(
    existing ? { plan: existing.plan as Plan, currentPeriodEnd: existing.current_period_end } : null,
    plan,
    currentPeriodEnd,
    Date.now(),
    { free: FREE_CREDITS_PER_MONTH, pro: PRO_CREDITS_PER_MONTH }
  );

  const { error: updateError, count } = await supabase
    .from("profiles")
    .update(update, { count: "exact" })
    .eq("stripe_customer_id", stripeCustomerId);
  if (updateError) {
    console.error("[vcut] webhook: profile update failed for", stripeCustomerId, updateError);
    return false;
  } else if (!count) {
    // Matched zero rows — the row hadn't picked up this Stripe customer id yet (a real, if rare, race
    // between `checkout/route.ts`'s own write and this webhook arriving), or it was manually created
    // in Stripe with no matching Supabase user at all. Either way, silently "succeeding" at updating
    // nothing is exactly the shape of failure that went unnoticed before this log line existed.
    console.error("[vcut] webhook: no profile row matched stripe_customer_id", stripeCustomerId, "— update had no effect");
    return false;
  }
  return true;
}
