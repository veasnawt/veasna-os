import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import { ApiError } from "./paths";

/** Must match `0005_credit_allotment_increase.sql`'s `spend_credits` function's own hardcoded
 *  allotments — that function is the one place a LAZY refill (a free-plan user's `credits_reset_at`
 *  naturally passing) actually happens, so it needs these numbers regardless of what TypeScript code
 *  ever runs. These copies exist for `_lib/profiles.ts`'s IMMEDIATE top-up on a Stripe plan change
 *  (tied to the real billing period, not waiting for the lazy path) — genuinely duplicated, not read
 *  from one shared source, since a Postgres function body can't import a TS constant. Change both
 *  together.
 *
 *  Pro's 1200 (up from 300) and every per-operation credit cost (`REMOVE_OBJECT_CREDITS_PER_SECOND`,
 *  `REMOVE_OBJECT_FLAT_COST`, `CAPTIONS_CREDITS_PER_MINUTE`) all scale by the same 4x factor together
 *  — see that migration's own doc comment for why this changes the NUMBERS, not the actual real-world
 *  usage entitlement or margin, at all (300÷4 == 1200÷16, both 75 seconds of Remove Object for the
 *  same $9.99/month). Free's 90 (up from 5) is a genuinely more generous change, not a rescale — 5
 *  credits was worth barely one second of Remove Object at the old 4/sec rate, not a usable trial at
 *  all; 90 covers a real ~5.6-second removal or ~22 minutes of Captions, for a trivial ~$0.28/month
 *  worst-case cost per free user. */
export const FREE_CREDITS_PER_MONTH = 90;
export const PRO_CREDITS_PER_MONTH = 1200;

/** Atomically checks-and-decrements a user's credit balance via the `spend_credits` Postgres function
 *  (see `0003_credits.sql`'s own doc comment for why this has to be a DB-side function rather than a
 *  read-then-write in application code: two concurrent requests against the same balance would
 *  otherwise both pass a stale check). `true` means the spend succeeded and the caller's job should
 *  actually proceed; `false` means insufficient credits — the caller (`hostedCreditGatedRoute`) turns
 *  that into a 402, never runs the handler. Logs a `usage_events` row only on a successful spend — a
 *  refused attempt spent nothing, so there's nothing to log. */
export async function spendCredits(userId: string, feature: string, amount: number): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("spend_credits", { p_user_id: userId, p_amount: amount });
  if (error) throw new ApiError(500, "Could not check credits", "credits-check-failed");
  const spent = data === true;
  if (spent) {
    // Best-effort — a failed audit-log insert must never undo (or even fail) a spend that already
    // genuinely happened against the authoritative balance.
    await supabase.from("usage_events").insert({ user_id: userId, feature, credits_spent: amount }).then(
      () => {},
      () => {}
    );
  }
  return spent;
}

/** Refunds a spend for a job that failed outright (see `0004_credit_refunds.sql`'s own doc comment
 *  for why this exists — confirmed as a real gap, not hypothetical) — `captions/route.ts` and
 *  `inpaint/route.ts`'s job runners call this from their own failure branch, using the `ownerId`
 *  already stamped on the job at creation. Deliberately best-effort (logs, never throws): this runs
 *  from inside a `catch` block already handling a job failure — a refund that itself fails must never
 *  crash the failure-handling path or leave the job stuck reporting neither success nor failure. Never
 *  called for a `cancelled` job (see each caller's own reasoning: a user-initiated cancel may have
 *  already incurred real provider-side cost mid-flight, unlike an outright failure). */
export async function refundCredits(userId: string, amount: number): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.rpc("refund_credits", { p_user_id: userId, p_amount: amount });
  if (error) console.error("[vcut] credits: refund failed for", userId, error);
}

export interface CreditsStatus {
  remaining: number;
  resetAt: string;
}

/** Read-only balance check — used by `billing/status/route.ts` (surfaced to every platform via
 *  `getBillingStatus()`) and by UI code deciding whether to show a feature's real controls or an
 *  "upgrade to Pro" message before the user even attempts an action that would otherwise 402. Never
 *  spends anything itself. A user with no `profiles` row yet (never started a checkout AND never
 *  attempted a credit-gated feature) reads as the free allotment — `spend_credits` is what actually
 *  creates the row, on first real use; this function doesn't need to. */
export async function getCreditsStatus(userId: string): Promise<CreditsStatus> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("profiles").select("credits_remaining, credits_reset_at").eq("id", userId).maybeSingle();
  if (error) throw new ApiError(500, "Could not read credits", "credits-read-failed");
  if (!data) return { remaining: 5, resetAt: new Date().toISOString() };
  return { remaining: data.credits_remaining, resetAt: data.credits_reset_at };
}
