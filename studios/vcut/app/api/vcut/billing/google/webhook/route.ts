import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import { VCUT_HOSTED } from "../../../_lib/auth";
import { syncCanonicalSubscription, revokeCreditsIdempotent, findCanonicalProduct } from "../../../_lib/billingCore";
import {
  verifyGoogleSubscriptionPurchase,
  ANDROID_PACKAGE_NAME,
} from "../../../_lib/googlePlayServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Google Cloud Pub/Sub Push Message Envelope */
interface PubSubEnvelope {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
}

/** Google Play Developer Notification Payload */
interface GoogleDeveloperNotification {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: {
    version?: string;
    notificationType: number;
    purchaseToken: string;
    subscriptionId: string;
  };
  oneTimeProductNotification?: {
    version?: string;
    notificationType: number;
    purchaseToken: string;
    sku: string;
  };
  testNotification?: {
    version?: string;
  };
}

/** Google Subscription Notification Types:
 * 1 = RECOVERED, 2 = RENEWED, 3 = CANCELED, 4 = PURCHASED, 5 = ON_HOLD,
 * 6 = IN_GRACE_PERIOD, 7 = RESTARTED, 8 = PRICE_CHANGE_CONFIRMED, 9 = DEFERRED,
 * 10 = PAUSED, 11 = PAUSE_SCHEDULE_CHANGED, 12 = REVOKED, 13 = EXPIRED */
const SUB_TYPES = {
  RECOVERED: 1,
  RENEWED: 2,
  CANCELED: 3,
  PURCHASED: 4,
  ON_HOLD: 5,
  IN_GRACE_PERIOD: 6,
  RESTARTED: 7,
  PRICE_CONFIRMED: 8,
  DEFERRED: 9,
  PAUSED: 10,
  PAUSE_SCHEDULE_CHANGED: 11,
  REVOKED: 12,
  EXPIRED: 13,
} as const;

/** Google Play Real-Time Developer Notifications (RTDN) webhook handler.
 *  Receives lifecycle events (renewal, cancellation, expiration, refund) via Cloud Pub/Sub push. */
export async function POST(req: Request): Promise<Response> {
  if (!VCUT_HOSTED) {
    return Response.json({ error: "Not available outside the hosted web deployment." }, { status: 404 });
  }

  // 1. Optional token authentication configured via GOOGLE_RTDN_SECRET
  const expectedSecret = process.env.GOOGLE_RTDN_SECRET;
  if (expectedSecret) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || req.headers.get("x-webhook-token");
    if (token !== expectedSecret) {
      console.warn("[vcut] googlePlay RTDN: unauthorized webhook request");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const envelope = (await req.json()) as PubSubEnvelope;
  if (!envelope.message?.data) {
    return Response.json({ error: "Invalid Pub/Sub envelope" }, { status: 400 });
  }

  // 2. Decode base64 notification payload
  let notification: GoogleDeveloperNotification;
  try {
    const jsonStr = Buffer.from(envelope.message.data, "base64").toString("utf-8");
    notification = JSON.parse(jsonStr);
  } catch (err) {
    console.error("[vcut] googlePlay RTDN: failed to decode message data", err);
    return Response.json({ error: "Malformed payload" }, { status: 400 });
  }

  // Test ping
  if (notification.testNotification) {
    console.log("[vcut] googlePlay RTDN: received test notification", notification.testNotification);
    return Response.json({ received: true });
  }

  if (notification.packageName && notification.packageName !== ANDROID_PACKAGE_NAME) {
    console.warn("[vcut] googlePlay RTDN: package mismatch", notification.packageName);
    return Response.json({ received: true });
  }

  const supabase = getSupabaseAdminClient();

  // 3. Handle Subscription Lifecycle Events
  if (notification.subscriptionNotification) {
    const subNotif = notification.subscriptionNotification;
    const { notificationType, purchaseToken, subscriptionId } = subNotif;

    // Find the user owning this subscription
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("user_id, status, current_period_end")
      .eq("provider", "google_play")
      .or(`purchase_token.eq.${purchaseToken},provider_subscription_id.eq.${purchaseToken}`)
      .maybeSingle();

    if (!existingSub?.user_id) {
      console.warn("[vcut] googlePlay RTDN: no existing subscription found for token", purchaseToken.slice(0, 10));
      // Acknowledge with 200 so Pub/Sub does not endlessly retry unmapped events
      return Response.json({ received: true });
    }

    const userId = existingSub.user_id;

    try {
      // Re-verify latest status directly with Google
      const verified = await verifyGoogleSubscriptionPurchase({
        packageName: ANDROID_PACKAGE_NAME,
        subscriptionId,
        token: purchaseToken,
      });

      const expiryMs = Number(verified.expiryTimeMillis);
      const startMs = Number(verified.startTimeMillis);
      const periodStartIso = Number.isFinite(startMs) ? new Date(startMs).toISOString() : null;
      const periodEndIso = Number.isFinite(expiryMs) ? new Date(expiryMs).toISOString() : null;

      let nextStatus: "active" | "canceled" | "expired" | "on_hold" | "in_grace_period" | "paused" = "active";
      let cancelAtPeriodEnd = false;

      switch (notificationType) {
        case SUB_TYPES.RECOVERED:
        case SUB_TYPES.RENEWED:
        case SUB_TYPES.PURCHASED:
        case SUB_TYPES.RESTARTED:
          nextStatus = "active";
          break;
        case SUB_TYPES.CANCELED:
          nextStatus = "canceled";
          cancelAtPeriodEnd = true;
          break;
        case SUB_TYPES.ON_HOLD:
          nextStatus = "on_hold";
          break;
        case SUB_TYPES.IN_GRACE_PERIOD:
          nextStatus = "in_grace_period";
          break;
        case SUB_TYPES.PAUSED:
          nextStatus = "paused";
          break;
        case SUB_TYPES.REVOKED:
        case SUB_TYPES.EXPIRED:
          nextStatus = "expired";
          break;
        default:
          nextStatus = Boolean(verified.userCancellationTimeMillis) ? "canceled" : "active";
          cancelAtPeriodEnd = nextStatus === "canceled";
          break;
      }

      await syncCanonicalSubscription({
        userId,
        provider: "google_play",
        providerSubscriptionId: verified.orderId || purchaseToken,
        status: nextStatus,
        productId: subscriptionId,
        currentPeriodStart: periodStartIso,
        currentPeriodEnd: periodEndIso,
        cancelAtPeriodEnd,
        purchaseToken,
        rawData: verified as unknown as Record<string, unknown>,
      });

      console.log(`[vcut] googlePlay RTDN: processed sub event ${notificationType} -> ${nextStatus} for user ${userId}`);
    } catch (err) {
      console.error("[vcut] googlePlay RTDN: error processing subscription event", err);
      // Return 500 to allow Pub/Sub retry if transient
      return Response.json({ error: "Failed to sync subscription event" }, { status: 500 });
    }
  }

  // 4. Handle Consumable / One-time Product Revocation (Refunds)
  if (notification.oneTimeProductNotification) {
    const { notificationType, purchaseToken, sku } = notification.oneTimeProductNotification;

    // 2 = Canceled / Refunded
    if (notificationType === 2) {
      const { data: tx } = await supabase
        .from("credit_transactions")
        .select("user_id, credits_amount, provider_transaction_id")
        .eq("provider", "google_play")
        .or(`provider_transaction_id.eq.${purchaseToken},raw_data->>orderId.eq.${purchaseToken}`)
        .maybeSingle();

      if (tx) {
        await revokeCreditsIdempotent({
          userId: tx.user_id,
          amount: tx.credits_amount,
          provider: "google_play",
          transactionId: tx.provider_transaction_id,
          reason: "google_play_refund",
        });
        console.log(`[vcut] googlePlay RTDN: revoked ${tx.credits_amount} credits for refunded token ${purchaseToken.slice(0, 10)}`);
      }
    }
  }

  return Response.json({ received: true });
}
