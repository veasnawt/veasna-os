import assert from "node:assert/strict";
import { test, describe } from "node:test";
import {
  findCanonicalProduct,
  isSubscriptionRecordActive,
  PRODUCT_CATALOG,
} from "../app/api/vcut/_lib/billingCore.ts";
import {
  verifyGoogleSubscriptionPurchase,
  verifyGoogleProductPurchase,
  ANDROID_PACKAGE_NAME,
} from "../app/api/vcut/_lib/googlePlayServer.ts";

describe("Cross-Platform Billing Core & Google Play Integration", () => {
  test("findCanonicalProduct correctly resolves Google Play and Stripe products", () => {
    const monthlySub = findCanonicalProduct("google_play", "vcut_pro_monthly");
    assert.ok(monthlySub);
    assert.equal(monthlySub?.plan, "pro");
    assert.equal(monthlySub?.period, "monthly");
    assert.equal(monthlySub?.type, "subscription");
    assert.equal(monthlySub?.credits, 1200);

    const annualSub = findCanonicalProduct("google_play", "vcut_pro_annual");
    assert.ok(annualSub);
    assert.equal(annualSub?.plan, "pro");
    assert.equal(annualSub?.period, "annual");

    const creditsPack = findCanonicalProduct("google_play", "credits_500");
    assert.ok(creditsPack);
    assert.equal(creditsPack?.type, "consumable_pack");
    assert.equal(creditsPack?.credits, 500);

    const unknownProduct = findCanonicalProduct("google_play", "non_existent_sku");
    assert.equal(unknownProduct, null);
  });

  test("isSubscriptionRecordActive evaluates active, grace period, and canceled statuses", () => {
    const now = Date.now();
    const futureDate = new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString();
    const pastDate = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Active with future end -> ACTIVE
    assert.equal(
      isSubscriptionRecordActive({ status: "active", current_period_end: futureDate }, now),
      true,
      "Active sub with future period should be active"
    );

    // 2. Active without period end -> ACTIVE
    assert.equal(
      isSubscriptionRecordActive({ status: "active", current_period_end: null }, now),
      true,
      "Active sub with open period should be active"
    );

    // 3. In grace period with future date -> ACTIVE
    assert.equal(
      isSubscriptionRecordActive({ status: "in_grace_period", current_period_end: futureDate }, now),
      true,
      "Sub in grace period should grant Pro"
    );

    // 4. Canceled but future date (paid until end of month) -> ACTIVE
    assert.equal(
      isSubscriptionRecordActive({ status: "canceled", current_period_end: futureDate }, now),
      true,
      "Canceled sub before period end should remain active"
    );

    // 5. Canceled and past date -> INACTIVE
    assert.equal(
      isSubscriptionRecordActive({ status: "canceled", current_period_end: pastDate }, now),
      false,
      "Canceled sub past period end should be inactive"
    );

    // 6. Expired -> INACTIVE
    assert.equal(
      isSubscriptionRecordActive({ status: "expired", current_period_end: pastDate }, now),
      false,
      "Expired sub should be inactive"
    );

    // 7. On hold (billing failure) -> INACTIVE
    assert.equal(
      isSubscriptionRecordActive({ status: "on_hold", current_period_end: futureDate }, now),
      false,
      "Sub on hold should be inactive"
    );
  });

  test("Google Play verification rejects wrong package/application ID", async () => {
    await assert.rejects(
      async () => {
        await verifyGoogleSubscriptionPurchase({
          packageName: "com.imposter.fakeapp",
          subscriptionId: "vcut_pro_monthly",
          token: "test_token_123",
        });
      },
      {
        name: "Error",
        message: "Package name mismatch",
      }
    );

    await assert.rejects(
      async () => {
        await verifyGoogleProductPurchase({
          packageName: "com.imposter.fakeapp",
          productId: "credits_100",
          token: "test_token_123",
        });
      },
      {
        name: "Error",
        message: "Package name mismatch",
      }
    );
  });

  test("Google Play test purchase verification returns valid structure for test tokens", async () => {
    const verifiedSub = await verifyGoogleSubscriptionPurchase({
      packageName: ANDROID_PACKAGE_NAME,
      subscriptionId: "vcut_pro_monthly",
      token: "test_sub_valid_token_abc",
    });

    assert.equal(verifiedSub.autoRenewing, true);
    assert.equal(verifiedSub.paymentState, 1);
    assert.ok(Number(verifiedSub.expiryTimeMillis) > Date.now());

    const verifiedProduct = await verifyGoogleProductPurchase({
      packageName: ANDROID_PACKAGE_NAME,
      productId: "credits_500",
      token: "test_inapp_token_xyz",
    });

    assert.equal(verifiedProduct.purchaseState, 0); // Purchased
    assert.ok(verifiedProduct.orderId?.includes("credits_500"));
  });

  test("Apple IAP product catalog entries are ready for future StoreKit expansion", () => {
    const iosMonthly = findCanonicalProduct("apple", "vcut_pro_monthly_ios");
    assert.ok(iosMonthly);
    assert.equal(iosMonthly?.provider, "apple");
    assert.equal(iosMonthly?.type, "subscription");
    assert.equal(iosMonthly?.credits, 1200);

    const iosCredits = findCanonicalProduct("apple", "credits_100_ios");
    assert.ok(iosCredits);
    assert.equal(iosCredits?.provider, "apple");
    assert.equal(iosCredits?.credits, 100);
  });
});
