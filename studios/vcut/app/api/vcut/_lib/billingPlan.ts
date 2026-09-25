/** Pure billing rules the Stripe webhook applies — kept free of Stripe and Supabase so they can be unit-tested.
 *
 *  Stripe does not guarantee webhook ordering (or exactly-once delivery). The old handler trusted each event's
 *  own payload, so a late `customer.subscription.updated` (still "active") arriving after
 *  `customer.subscription.deleted` put a cancelled user straight back on Pro. The webhook now asks Stripe for
 *  the customer's CURRENT subscriptions whenever any subscription event arrives and derives the plan from that
 *  snapshot — so the result is the same no matter which order events land in, or how many times one is
 *  redelivered. */

export type Plan = "free" | "pro";

export interface SubscriptionSnapshot {
  status: string;
  /** Unix seconds, as Stripe reports it; `null` when absent. */
  currentPeriodEnd: number | null;
}

/** Statuses that grant Pro. Anything else (canceled, unpaid, incomplete, past_due, paused...) is free. */
const PRO_STATUSES = new Set(["active", "trialing"]);

/** The plan a customer should be on given ALL of their subscriptions: Pro if any is active/trialing, with the
 *  latest period end among those; free otherwise. Multiple subscriptions are rare but real (a resubscribe
 *  before the old one is fully cancelled) — judging by the set, not by whichever event arrived last, is what
 *  makes ordering irrelevant. */
export function derivePlan(subscriptions: SubscriptionSnapshot[]): { plan: Plan; currentPeriodEnd: string | null } {
  const active = subscriptions.filter((s) => PRO_STATUSES.has(s.status));
  if (active.length === 0) return { plan: "free", currentPeriodEnd: null };
  const ends = active.map((s) => s.currentPeriodEnd).filter((e): e is number => typeof e === "number" && Number.isFinite(e));
  const latest = ends.length > 0 ? Math.max(...ends) : null;
  return { plan: "pro", currentPeriodEnd: latest === null ? null : new Date(latest * 1000).toISOString() };
}

export interface ProfilePlanState {
  plan: Plan;
  currentPeriodEnd: string | null;
}

export interface CreditLimits {
  free: number;
  pro: number;
}

/** The `profiles` columns to write for a plan change. Credits are only touched when they should be:
 *  - a NEW Pro billing period (its `current_period_end` differs from what's stored) tops up to the Pro
 *    allotment — but a redelivered or unrelated update (a card change) for the same period does not, or it
 *    could be replayed for free credits;
 *  - a Pro -> free downgrade resets to the free allotment, once. A user who is ALREADY free must not be
 *    reset: `customer.subscription.updated` events with a non-active status keep arriving for a lapsed
 *    customer, and resetting on each one refilled a free user's credits every time. */
export function buildPlanUpdate(
  existing: ProfilePlanState | null,
  plan: Plan,
  currentPeriodEnd: string | null,
  nowMs: number,
  limits: CreditLimits
): Record<string, unknown> {
  const update: Record<string, unknown> = { plan, current_period_end: currentPeriodEnd, updated_at: new Date(nowMs).toISOString() };
  if (plan === "pro" && currentPeriodEnd && currentPeriodEnd !== existing?.currentPeriodEnd) {
    update.credits_remaining = limits.pro;
    update.credits_reset_at = currentPeriodEnd;
  } else if (plan === "free" && existing?.plan === "pro") {
    update.credits_remaining = limits.free;
    update.credits_reset_at = new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  return update;
}
