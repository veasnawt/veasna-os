import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import { FREE_CREDITS_PER_MONTH, PRO_CREDITS_PER_MONTH } from "./credits.ts";

export type BillingProvider = "stripe" | "google_play" | "apple" | "beta";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "canceled"
  | "expired"
  | "in_grace_period"
  | "on_hold"
  | "paused";

export type CanonicalPlan = "free" | "pro";

export type ProductType = "subscription" | "consumable_pack";

export interface CanonicalProduct {
  id: string;
  provider: BillingProvider;
  providerProductId: string;
  type: ProductType;
  plan?: CanonicalPlan;
  credits?: number;
  period?: "monthly" | "annual";
}

/** Product catalog mapping provider product IDs to canonical entitlements and credits.
 *  Server is the single source of truth: client requests cannot specify credit amounts or plans. */
export const PRODUCT_CATALOG: Record<string, CanonicalProduct> = {
  // Stripe
  stripe_pro_monthly: {
    id: "stripe_pro_monthly",
    provider: "stripe",
    providerProductId: process.env.STRIPE_PRICE_ID ?? "price_pro_monthly",
    type: "subscription",
    plan: "pro",
    credits: PRO_CREDITS_PER_MONTH,
    period: "monthly",
  },

  // Google Play Subscriptions
  vcut_pro_monthly: {
    id: "vcut_pro_monthly",
    provider: "google_play",
    providerProductId: "vcut_pro_monthly",
    type: "subscription",
    plan: "pro",
    credits: PRO_CREDITS_PER_MONTH,
    period: "monthly",
  },
  vcut_pro_annual: {
    id: "vcut_pro_annual",
    provider: "google_play",
    providerProductId: "vcut_pro_annual",
    type: "subscription",
    plan: "pro",
    credits: PRO_CREDITS_PER_MONTH,
    period: "annual",
  },

  // Google Play Consumable Credit Packs
  credits_100: {
    id: "credits_100",
    provider: "google_play",
    providerProductId: "credits_100",
    type: "consumable_pack",
    credits: 100,
  },
  credits_500: {
    id: "credits_500",
    provider: "google_play",
    providerProductId: "credits_500",
    type: "consumable_pack",
    credits: 500,
  },
  credits_1200: {
    id: "credits_1200",
    provider: "google_play",
    providerProductId: "credits_1200",
    type: "consumable_pack",
    credits: 1200,
  },

  // Apple In-App Purchases (architecture-ready for StoreKit implementation)
  vcut_pro_monthly_ios: {
    id: "vcut_pro_monthly_ios",
    provider: "apple",
    providerProductId: "vcut_pro_monthly_ios",
    type: "subscription",
    plan: "pro",
    credits: PRO_CREDITS_PER_MONTH,
    period: "monthly",
  },
  vcut_pro_annual_ios: {
    id: "vcut_pro_annual_ios",
    provider: "apple",
    providerProductId: "vcut_pro_annual_ios",
    type: "subscription",
    plan: "pro",
    credits: PRO_CREDITS_PER_MONTH,
    period: "annual",
  },
  credits_100_ios: {
    id: "credits_100_ios",
    provider: "apple",
    providerProductId: "credits_100_ios",
    type: "consumable_pack",
    credits: 100,
  },
  credits_500_ios: {
    id: "credits_500_ios",
    provider: "apple",
    providerProductId: "credits_500_ios",
    type: "consumable_pack",
    credits: 500,
  },
  credits_1200_ios: {
    id: "credits_1200_ios",
    provider: "apple",
    providerProductId: "credits_1200_ios",
    type: "consumable_pack",
    credits: 1200,
  },
};

/** Finds canonical product definition by provider and product identifier */
export function findCanonicalProduct(provider: BillingProvider, productId: string): CanonicalProduct | null {
  for (const product of Object.values(PRODUCT_CATALOG)) {
    if (product.provider === provider && (product.providerProductId === productId || product.id === productId)) {
      return product;
    }
  }
  return null;
}

export interface EntitlementResolution {
  isPro: boolean;
  plan: CanonicalPlan;
  activeProvider: BillingProvider | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** Determines whether a subscription record is currently valid for Pro access.
 *  Active, trialing, and grace period are valid.
 *  Canceled subscriptions remain valid until their current period end has passed. */
export function isSubscriptionRecordActive(sub: {
  status: string;
  current_period_end: string | null;
}, nowMs: number = Date.now()): boolean {
  const PRO_STATUSES = new Set(["active", "trialing", "in_grace_period"]);
  if (PRO_STATUSES.has(sub.status)) {
    if (!sub.current_period_end) return true;
    return new Date(sub.current_period_end).getTime() > nowMs;
  }
  if (sub.status === "canceled" && sub.current_period_end) {
    return new Date(sub.current_period_end).getTime() > nowMs;
  }
  return false;
}

/** Downgrades an expired user to free plan and resets subscription credits back to free allotment,
 *  while safely preserving any unspent purchased consumable credit packs. */
export async function downgradeExpiredUserToFree(
  userId: string,
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  nowMs: number = Date.now()
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, credits_remaining, current_period_end")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || profile.plan === "free") {
    return;
  }

  const currentCredits = profile.credits_remaining ?? FREE_CREDITS_PER_MONTH;

  // Query any purchased consumable packs (one-time purchases that should NEVER expire)
  let purchasedPackCredits = 0;
  try {
    const { data: packs } = await supabase
      .from("credit_transactions")
      .select("credits_amount")
      .eq("user_id", userId)
      .eq("type", "consumable_pack")
      .eq("status", "completed");

    if (packs && packs.length > 0) {
      purchasedPackCredits = packs.reduce((sum, p) => sum + (p.credits_amount || 0), 0);
    }
  } catch (err) {
    console.warn("[vcut] billingCore: could not query consumable packs on downgrade", err);
  }

  // Allowed retained balance = free monthly allotment + any purchased packs
  const maxRetained = FREE_CREDITS_PER_MONTH + purchasedPackCredits;
  const newCredits = Math.min(currentCredits, maxRetained);

  await supabase
    .from("profiles")
    .update({
      plan: "free",
      credits_remaining: newCredits,
      credits_reset_at: new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(nowMs).toISOString(),
    })
    .eq("id", userId);

  console.log(`[vcut] billingCore: downgraded user ${userId} to free. Credits reset from ${currentCredits} to ${newCredits} (packs preserved: ${purchasedPackCredits})`);
}

/** Canonical Entitlement Resolution
 *  Queries all provider subscriptions (Stripe, Google Play, Apple) and legacy profiles.
 *  A user who buys Pro on Android Google Play will have Pro recognized across web, desktop, etc. */
export async function resolveUserEntitlements(userId: string): Promise<EntitlementResolution> {
  const supabase = getSupabaseAdminClient();
  const nowMs = Date.now();

  // 1. Check subscriptions table
  let activeSub: {
    provider: BillingProvider;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null = null;
  let hasSubscriptions = false;

  try {
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("provider, status, current_period_end, cancel_at_period_end")
      .eq("user_id", userId);

    if (!error && subs && subs.length > 0) {
      hasSubscriptions = true;
      for (const s of subs) {
        if (isSubscriptionRecordActive(s, nowMs)) {
          if (!activeSub || (s.current_period_end && (!activeSub.current_period_end || new Date(s.current_period_end).getTime() > new Date(activeSub.current_period_end).getTime()))) {
            activeSub = {
              provider: s.provider as BillingProvider,
              current_period_end: s.current_period_end,
              cancel_at_period_end: Boolean(s.cancel_at_period_end),
            };
          }
        }
      }
    }
  } catch (err) {
    // If subscriptions table does not exist yet (pre-migration), gracefully fall back
    console.warn("[vcut] billingCore: could not query subscriptions table, falling back to profiles", err);
  }

  if (activeSub) {
    // Synchronize to profiles table for fast cached lookup and backward compatibility
    await supabase.from("profiles").update({
      plan: "pro",
      current_period_end: activeSub.current_period_end,
      updated_at: new Date(nowMs).toISOString(),
    }).eq("id", userId);

    return {
      isPro: true,
      plan: "pro",
      activeProvider: activeSub.provider,
      currentPeriodEnd: activeSub.current_period_end,
      cancelAtPeriodEnd: activeSub.cancel_at_period_end,
    };
  }

  // 2. Backward compatibility: check profiles table directly (e.g. existing Stripe users)
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, current_period_end, stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.plan === "pro") {
    const isStillActive = hasSubscriptions
      ? false
      : (!profile.current_period_end || new Date(profile.current_period_end).getTime() > nowMs);

    if (isStillActive) {
      return {
        isPro: true,
        plan: "pro",
        activeProvider: profile.stripe_customer_id ? "stripe" : null,
        currentPeriodEnd: profile.current_period_end,
        cancelAtPeriodEnd: false,
      };
    } else {
      // Period expired: degrade back to free and reset credits
      await downgradeExpiredUserToFree(userId, supabase, nowMs);
    }
  }

  return {
    isPro: false,
    plan: "free",
    activeProvider: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };
}

export interface SyncSubscriptionParams {
  userId: string;
  provider: BillingProvider;
  providerSubscriptionId: string;
  providerCustomerId?: string | null;
  status: SubscriptionStatus;
  productId: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  environment?: "production" | "test" | "sandbox";
  purchaseToken?: string | null;
  rawData?: Record<string, unknown> | null;
}

/** Synchronizes a subscription state from a verified provider into the canonical system */
export async function syncCanonicalSubscription(params: SyncSubscriptionParams): Promise<EntitlementResolution> {
  const supabase = getSupabaseAdminClient();
  const nowMs = Date.now();
  const product = findCanonicalProduct(params.provider, params.productId);
  const plan: CanonicalPlan = product?.plan ?? "pro";

  // Upsert into subscriptions table
  try {
    await supabase.from("subscriptions").upsert(
      {
        user_id: params.userId,
        provider: params.provider,
        provider_subscription_id: params.providerSubscriptionId,
        provider_customer_id: params.providerCustomerId ?? null,
        status: params.status,
        plan,
        product_id: params.productId,
        current_period_start: params.currentPeriodStart ?? null,
        current_period_end: params.currentPeriodEnd ?? null,
        cancel_at_period_end: params.cancelAtPeriodEnd ?? false,
        environment: params.environment ?? "production",
        purchase_token: params.purchaseToken ?? null,
        raw_data: params.rawData ?? null,
        updated_at: new Date(nowMs).toISOString(),
      },
      { onConflict: "provider,provider_subscription_id" }
    );
  } catch (err) {
    console.warn("[vcut] billingCore: error upserting to subscriptions table", err);
  }

  // Check if active and top up credits if new period
  const isActive = isSubscriptionRecordActive({
    status: params.status,
    current_period_end: params.currentPeriodEnd ?? null,
  }, nowMs);

  if (isActive && plan === "pro") {
    // Check if new billing period to top up credits
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("plan, current_period_end")
      .eq("id", params.userId)
      .maybeSingle();

    const isNewPeriod = params.currentPeriodEnd && params.currentPeriodEnd !== currentProfile?.current_period_end;
    const update: Record<string, unknown> = {
      plan: "pro",
      current_period_end: params.currentPeriodEnd ?? null,
      updated_at: new Date(nowMs).toISOString(),
    };

    if (isNewPeriod || currentProfile?.plan !== "pro") {
      update.credits_remaining = PRO_CREDITS_PER_MONTH;
      update.credits_reset_at = params.currentPeriodEnd ?? new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Record idempotent transaction for subscription monthly allotment
      const txId = `sub_${params.provider}_${params.providerSubscriptionId}_${params.currentPeriodEnd ?? nowMs}`;
      await grantCreditsIdempotent({
        userId: params.userId,
        amount: PRO_CREDITS_PER_MONTH,
        provider: params.provider,
        transactionId: txId,
        productId: params.productId,
        type: "subscription_allotment",
        rawData: { subscriptionId: params.providerSubscriptionId, periodEnd: params.currentPeriodEnd },
      });
    }

    await supabase.from("profiles").upsert(
      { id: params.userId, ...update },
      { onConflict: "id" }
    );
  } else if (!isActive) {
    // Not active: check if user has other subscriptions before downgrading
    const resolution = await resolveUserEntitlements(params.userId);
    if (!resolution.isPro) {
      await downgradeExpiredUserToFree(params.userId, supabase, nowMs);
    }
  }

  return resolveUserEntitlements(params.userId);
}

export interface GrantCreditsParams {
  userId: string;
  amount: number;
  provider: BillingProvider | "system";
  transactionId: string;
  productId?: string | null;
  type?: "subscription_allotment" | "consumable_pack" | "refund" | "bonus" | "beta_grant";
  rawData?: Record<string, unknown> | null;
}

export interface GrantCreditsResult {
  success: boolean;
  alreadyProcessed: boolean;
  creditsRemaining: number;
}

/** Idempotent Credit Granting
 *  Ensures transactions (e.g. Google Play orderId/purchaseToken) can NEVER grant credits twice.
 *  Uses Postgres RPC with row locks and transaction uniqueness. */
export async function grantCreditsIdempotent(params: GrantCreditsParams): Promise<GrantCreditsResult> {
  const supabase = getSupabaseAdminClient();

  // Try Postgres RPC grant_credits_idempotent
  const { data, error } = await supabase.rpc("grant_credits_idempotent", {
    p_user_id: params.userId,
    p_amount: params.amount,
    p_provider: params.provider,
    p_transaction_id: params.transactionId,
    p_product_id: params.productId ?? null,
    p_type: params.type ?? "consumable_pack",
    p_raw_data: params.rawData ?? null,
  });

  if (!error && data && typeof data === "object") {
    const res = data as { success?: boolean; already_processed?: boolean; credits_remaining?: number };
    return {
      success: res.success ?? true,
      alreadyProcessed: res.already_processed ?? false,
      creditsRemaining: res.credits_remaining ?? 0,
    };
  }

  // Graceful fallback if migration RPC is pending in database:
  // Perform application-level atomic idempotency check
  console.warn("[vcut] billingCore: grant_credits_idempotent RPC unavailable, using fallback", error?.message);

  const { data: existingTx } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("provider", params.provider)
    .eq("provider_transaction_id", params.transactionId)
    .maybeSingle();

  if (existingTx) {
    const { data: profile } = await supabase.from("profiles").select("credits_remaining").eq("id", params.userId).maybeSingle();
    return {
      success: true,
      alreadyProcessed: true,
      creditsRemaining: profile?.credits_remaining ?? 0,
    };
  }

  // Increment profile balance
  const { data: profile } = await supabase.from("profiles").select("credits_remaining").eq("id", params.userId).maybeSingle();
  const newBalance = (profile?.credits_remaining ?? 90) + params.amount;
  await supabase.from("profiles").upsert(
    {
      id: params.userId,
      credits_remaining: newBalance,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  // Record transaction
  try {
    await supabase.from("credit_transactions").insert({
      user_id: params.userId,
      provider: params.provider,
      provider_transaction_id: params.transactionId,
      product_id: params.productId ?? null,
      credits_amount: params.amount,
      type: params.type ?? "consumable_pack",
      status: "completed",
      raw_data: params.rawData ?? null,
    });
  } catch (txErr) {
    console.warn("[vcut] billingCore: could not write credit_transactions row", txErr);
  }

  return {
    success: true,
    alreadyProcessed: false,
    creditsRemaining: newBalance,
  };
}

/** Idempotent Credit Revocation (for refunds, chargebacks, revocations) */
export async function revokeCreditsIdempotent(params: {
  userId: string;
  amount: number;
  provider: BillingProvider | "system";
  transactionId: string;
  reason?: string;
}): Promise<{ success: boolean; creditsRemaining: number }> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase.rpc("revoke_credits_idempotent", {
    p_user_id: params.userId,
    p_amount: params.amount,
    p_provider: params.provider,
    p_transaction_id: params.transactionId,
    p_reason: params.reason ?? "refund",
  });

  if (!error && data && typeof data === "object") {
    const res = data as { success?: boolean; credits_remaining?: number };
    return { success: res.success ?? true, creditsRemaining: res.credits_remaining ?? 0 };
  }

  // Fallback
  const { data: profile } = await supabase.from("profiles").select("credits_remaining").eq("id", params.userId).maybeSingle();
  const newBalance = Math.max(0, (profile?.credits_remaining ?? 0) - params.amount);
  await supabase.from("profiles").update({
    credits_remaining: newBalance,
    updated_at: new Date().toISOString(),
  }).eq("id", params.userId);

  return { success: true, creditsRemaining: newBalance };
}
