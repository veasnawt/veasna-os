import { corsPreflight, hostedOnlyRoute } from "../../../_lib/localOnly";
import { ApiError } from "../../../_lib/paths";
import { findCanonicalProduct, syncCanonicalSubscription, grantCreditsIdempotent, resolveUserEntitlements } from "../../../_lib/billingCore";
import {
  verifyGoogleSubscriptionPurchase,
  verifyGoogleProductPurchase,
  acknowledgeGoogleSubscription,
  acknowledgeGoogleProduct,
  ANDROID_PACKAGE_NAME,
} from "../../../_lib/googlePlayServer";
import { getCreditsStatus } from "../../../_lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

interface VerifyRequestBody {
  purchaseToken: string;
  productId: string;
  type: "subscription" | "inapp";
  packageName?: string;
}

/** Server-side purchase verification for Google Play on Android.
 *  Never trusts client claims: validates purchase token against Google Play Developer API,
 *  checks package ID, derives entitlements from server product catalog, and records idempotently. */
export const POST = hostedOnlyRoute(async (req, user) => {
  const body = (await req.json()) as Partial<VerifyRequestBody>;
  const { purchaseToken, productId, type, packageName } = body;

  if (!purchaseToken || typeof purchaseToken !== "string") {
    throw new ApiError(400, "Missing purchaseToken", "missing-purchase-token");
  }
  if (!productId || typeof productId !== "string") {
    throw new ApiError(400, "Missing productId", "missing-product-id");
  }
  if (type !== "subscription" && type !== "inapp") {
    throw new ApiError(400, "Invalid product type (must be 'subscription' or 'inapp')", "invalid-product-type");
  }

  // 1. Verify package name
  const pkg = packageName ?? ANDROID_PACKAGE_NAME;
  if (pkg !== ANDROID_PACKAGE_NAME) {
    throw new ApiError(400, `Package name mismatch: expected ${ANDROID_PACKAGE_NAME}`, "invalid-package-name");
  }

  // 2. Validate product against server catalog (client cannot dictate price or plan)
  const product = findCanonicalProduct("google_play", productId);
  if (!product) {
    throw new ApiError(400, `Unrecognized product ID '${productId}' in server catalog`, "unrecognized-product");
  }

  // 3. Handle Subscription verification
  if (type === "subscription") {
    if (product.type !== "subscription") {
      throw new ApiError(400, `Product '${productId}' is not configured as a subscription`, "product-type-mismatch");
    }

    const verified = await verifyGoogleSubscriptionPurchase({
      packageName: pkg,
      subscriptionId: productId,
      token: purchaseToken,
    });

    const now = Date.now();
    const expiryMs = Number(verified.expiryTimeMillis);
    const startMs = Number(verified.startTimeMillis);

    // Check payment state: 0 = Pending (e.g. slow payment method)
    if (verified.paymentState === 0) {
      return Response.json({
        success: false,
        status: "pending",
        message: "Payment is pending authorization in Google Play",
        isPro: false,
      });
    }

    // Check if expired
    const isExpired = Number.isFinite(expiryMs) && expiryMs <= now;
    if (isExpired) {
      return Response.json({
        success: false,
        status: "expired",
        message: "This Google Play subscription has expired",
        isPro: false,
      });
    }

    // Acknowledge if not already done
    if (verified.acknowledgementState === 0) {
      await acknowledgeGoogleSubscription({
        packageName: pkg,
        subscriptionId: productId,
        token: purchaseToken,
        developerPayload: user.id,
      });
    }

    const isCanceled = Boolean(verified.userCancellationTimeMillis) || verified.autoRenewing === false;
    const subscriptionStatus = isCanceled ? "canceled" : "active";

    // Synchronize to canonical subscription ledger
    const periodStartIso = Number.isFinite(startMs) ? new Date(startMs).toISOString() : null;
    const periodEndIso = Number.isFinite(expiryMs) ? new Date(expiryMs).toISOString() : null;

    const entitlement = await syncCanonicalSubscription({
      userId: user.id,
      provider: "google_play",
      providerSubscriptionId: verified.orderId || purchaseToken,
      status: subscriptionStatus,
      productId,
      currentPeriodStart: periodStartIso,
      currentPeriodEnd: periodEndIso,
      cancelAtPeriodEnd: isCanceled,
      purchaseToken,
      rawData: verified as unknown as Record<string, unknown>,
    });

    const credits = await getCreditsStatus(user.id);

    return Response.json({
      success: true,
      status: subscriptionStatus,
      plan: entitlement.plan,
      isPro: entitlement.isPro,
      currentPeriodEnd: entitlement.currentPeriodEnd,
      cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
      creditsRemaining: credits.remaining,
      orderId: verified.orderId ?? null,
    });
  }

  // 4. Handle In-App Consumable Credits verification
  if (product.type !== "consumable_pack" || !product.credits) {
    throw new ApiError(400, `Product '${productId}' is not configured as a consumable credit pack`, "product-type-mismatch");
  }

  const verified = await verifyGoogleProductPurchase({
    packageName: pkg,
    productId,
    token: purchaseToken,
  });

  // Check purchase state: 0 = Purchased, 1 = Canceled, 2 = Pending
  if (verified.purchaseState === 2) {
    return Response.json({
      success: false,
      status: "pending",
      message: "Purchase is pending authorization in Google Play",
      creditsGranted: 0,
    });
  }

  if (verified.purchaseState === 1) {
    throw new ApiError(400, "Purchase was canceled in Google Play", "purchase-canceled");
  }

  // Acknowledge if not already done
  if (verified.acknowledgementState === 0) {
    await acknowledgeGoogleProduct({
      packageName: pkg,
      productId,
      token: purchaseToken,
      developerPayload: user.id,
    });
  }

  // Idempotently grant credits
  const transactionId = verified.orderId || purchaseToken;
  const grantResult = await grantCreditsIdempotent({
    userId: user.id,
    amount: product.credits,
    provider: "google_play",
    transactionId,
    productId,
    type: "consumable_pack",
    rawData: verified as unknown as Record<string, unknown>,
  });

  return Response.json({
    success: true,
    status: "completed",
    creditsGranted: product.credits,
    creditsRemaining: grantResult.creditsRemaining,
    alreadyProcessed: grantResult.alreadyProcessed,
    orderId: verified.orderId ?? null,
  });
});
