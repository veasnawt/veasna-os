import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import { FREE_CREDITS_PER_MONTH, PRO_CREDITS_PER_MONTH } from "./credits";
import { buildPlanUpdate } from "./billingPlan";
import { ApiError } from "./paths";

export type Plan = "free" | "pro";

/** Lowercase letters, digits and underscores, 3-20 long — the exact rule decided for this feature (no
 *  hyphens, no reserved-word list). Mirrored in `profiles_username_format`, the DB-level CHECK constraint
 *  (`0015_username.sql`) — this is still the PRIMARY place it's enforced (a clean, specific error before
 *  ever reaching the database), the constraint is defense-in-depth for a value that ends up in a public
 *  URL path (`/u/<username>`), same reasoning that migration's own comment gives. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/** Lowercases and trims — the user's own instruction was "all lowercase," so normalization happens
 *  before validation, not as a separate case-insensitive comparison at query time (see
 *  `0015_username.sql`'s own comment on why no `citext`/case-folding is needed anywhere else). */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

/** Allowed creator name characters: Letters in any script (including Khmer, etc.),
 *  combining marks/accents (\p{M}), numbers, spaces, dots, hyphens, underscores, and apostrophes.
 *  Must start with a letter/mark/number and end with a letter/mark/number or dot.
 *  Length: 2 to 50 characters. */
export const DISPLAY_NAME_PATTERN = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}\s._'-]*[\p{L}\p{M}\p{N}.]$/u;

export function isValidDisplayName(name: string): boolean {
  const trimmed = name.trim();
  const len = [...trimmed].length;
  if (len < 2 || len > 50) return false;
  return DISPLAY_NAME_PATTERN.test(trimmed);
}

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
  /** `null` for anyone who hasn't set one yet — every caller falls back to the raw user id (or, for
   *  `/u/[id]`'s own URL, to the id it was already given), same "absent is a normal, handled state"
   *  convention `displayName` already established. */
  username: string | null;
  bio: string | null;
  avatarPath: string | null;
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
  const { data, error } = await supabase.from("profiles").select("id, display_name, username, bio, avatar_path").in("id", unique);
  if (error) {
    console.error("[vcut] profiles: could not batch-read display names for", unique, error);
    return result;
  }
  for (const row of data ?? []) result.set(row.id, { id: row.id, displayName: row.display_name, username: row.username, bio: row.bio, avatarPath: row.avatar_path });
  return result;
}

export async function getPublicProfile(userId: string): Promise<PublicProfile> {
  const profiles = await getPublicProfiles([userId]);
  return profiles.get(userId) ?? { id: userId, displayName: null, username: null, bio: null, avatarPath: null };
}

/** Resolves a `/u/[id]` URL SEGMENT to a user id — accepts either the raw Supabase auth UUID (existing
 *  shared links keep working forever) or a username (the new, readable form). Tries the UUID shape
 *  first since checking that is free (a regex, no query) before ever touching the database. `null` if
 *  the segment is a syntactically valid username but nothing has claimed it, or is neither shape at all
 *  — the caller 404s either way, same as an unmatched UUID already did before usernames existed. */
export async function resolveProfileIdFromUrlSegment(segment: string): Promise<string | null> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return segment;
  const normalized = normalizeUsername(segment);
  if (!isValidUsername(normalized)) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("profiles").select("id").eq("username", normalized).maybeSingle();
  if (error) {
    console.error("[vcut] profiles: could not resolve username", normalized, error);
    return null;
  }
  return data?.id ?? null;
}

/** `excludeUserId`: checking whether you can keep your OWN current username (or type toward it while
 *  editing) should never say "taken" — the same "your own current value doesn't collide with itself"
 *  rule any rename/uniqueness check needs. Returns `false` for a syntactically invalid username too, so
 *  the availability-check endpoint can use this as its one source of truth for "would this be
 *  accepted" rather than duplicating the format check at the call site. */
export async function isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
  if (!isValidUsername(username)) return false;
  const supabase = getSupabaseAdminClient();
  let query = supabase.from("profiles").select("id").eq("username", username);
  if (excludeUserId) query = query.neq("id", excludeUserId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[vcut] profiles: could not check username availability for", username, error);
    throw new ApiError(500, "Could not check that username", "username-check-failed");
  }
  return !data;
}

/** The one write path for a user's own username — same posture `setDisplayName` already established
 *  (service-role client, no client-writable RLS policy on `profiles` at all). Normalizes to lowercase
 *  and validates format BEFORE ever reaching the database (the DB's own CHECK constraint is real, but
 *  this is where a clean, specific error message comes from). A `23505` (unique_violation) from the
 *  partial unique index becomes a clean "already taken" `ApiError` instead of a raw database error
 *  leaking to the client — the same race an availability check alone can't fully close (two people
 *  typing the same free username at once), so the WRITE itself, not just the check, must handle it. */
export async function setUsername(userId: string, rawUsername: string): Promise<string> {
  const username = normalizeUsername(rawUsername);
  await setProfileIdentity(userId, { username });
  return username;
}

/** Validate every requested field before one atomic upsert so a taken username
 *  cannot leave the display name changed after a failed combined save. */
export async function setProfileIdentity(userId: string, fields: { displayName?: string; username?: string; bio?: string; avatarPath?: string | null }): Promise<void> {
  const update: { id: string; display_name?: string | null; username?: string; bio?: string | null; avatar_path?: string | null } = { id: userId };
  if (fields.displayName !== undefined) {
    if (typeof fields.displayName !== "string") throw new ApiError(400, "Invalid displayName", "invalid-display-name");
    const trimmed = fields.displayName.trim();
    if (trimmed.length > 0) {
      if (!isValidDisplayName(trimmed)) {
        throw new ApiError(
          400,
          "Name must be 2-50 characters: letters, numbers, spaces, dots, hyphens, and apostrophes",
          "invalid-display-name"
        );
      }
      update.display_name = trimmed;
    } else {
      update.display_name = null;
    }
  }
  if (fields.username !== undefined) {
    if (typeof fields.username !== "string") throw new ApiError(400, "Invalid username", "invalid-username");
    update.username = normalizeUsername(fields.username);
    if (!isValidUsername(update.username)) {
      throw new ApiError(400, "Usernames are 3-20 characters: lowercase letters, numbers, and underscores only", "invalid-username");
    }
  }
  if (fields.bio !== undefined) {
    if (typeof fields.bio !== "string" || [...fields.bio].length > 160) throw new ApiError(400, "Bio must be 160 characters or fewer", "invalid-bio");
    update.bio = fields.bio.trim() || null;
  }
  if (fields.avatarPath !== undefined) update.avatar_path = fields.avatarPath;
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("profiles").upsert(update, { onConflict: "id" });
  if (error) {
    if (error.code === "23505") throw new ApiError(409, "That username is already taken", "username-taken");
    console.error("[vcut] profiles: could not save identity for", userId, error);
    throw new ApiError(500, "Could not save your profile", "profile-write-failed");
  }
}

/** The one write path for a user's own display name — a plain upsert (not `setStripeCustomerId`'s own
 *  "must never clobber a plan a webhook already set" concern; nothing else in `profiles` depends on
 *  when this row first appears). Called from `profile/route.ts`'s own PATCH, itself the only thing
 *  allowed to set this: `profiles` still has NO client-facing update RLS policy at all — same posture
 *  the table's own original migration comment established for `plan` — enforced here by going through
 *  the service-role client from a route that itself requires a real session, not by loosening RLS. */
export async function setDisplayName(userId: string, displayName: string | null): Promise<void> {
  const trimmed = displayName ? displayName.trim() : null;
  if (trimmed && !isValidDisplayName(trimmed)) {
    throw new ApiError(
      400,
      "Name must be 2-50 characters: letters, numbers, spaces, dots, hyphens, and apostrophes",
      "invalid-display-name"
    );
  }
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("profiles").upsert({ id: userId, display_name: trimmed }, { onConflict: "id" });
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
    .select("id, plan, current_period_end")
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

  // Also mirror into canonical subscriptions table for multi-provider synchronization
  if (existing?.id) {
    try {
      await supabase.from("subscriptions").upsert(
        {
          user_id: existing.id,
          provider: "stripe",
          provider_subscription_id: `stripe_${stripeCustomerId}`,
          provider_customer_id: stripeCustomerId,
          status: plan === "pro" ? "active" : "canceled",
          plan,
          product_id: "stripe_pro_monthly",
          current_period_end: currentPeriodEnd,
          cancel_at_period_end: plan !== "pro",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider,provider_subscription_id" }
      );
    } catch {
      // Safe no-op if subscriptions table migration has not been applied yet
    }
  }

  return true;
}
