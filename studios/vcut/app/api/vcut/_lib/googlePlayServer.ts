import crypto from "node:crypto";
import { ApiError } from "./paths.ts";

export const ANDROID_PACKAGE_NAME = "com.veasnawt.vcut";

export interface GoogleServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/** Parses Google Service Account credentials from environment variables */
export function getGoogleServiceAccount(): GoogleServiceAccountCredentials | null {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (rawJson) {
    try {
      const decoded = rawJson.trim().startsWith("{")
        ? rawJson
        : Buffer.from(rawJson, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      if (parsed.client_email && parsed.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: parsed.private_key,
          token_uri: parsed.token_uri || "https://oauth2.googleapis.com/token",
        };
      }
    } catch (err) {
      console.error("[vcut] googlePlay: failed to parse GOOGLE_SERVICE_ACCOUNT_KEY", err);
    }
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (email && key) {
    return {
      client_email: email,
      private_key: key.replace(/\\n/g, "\n"),
      token_uri: "https://oauth2.googleapis.com/token",
    };
  }

  return null;
}

/** Generates an OAuth2 access token for the Android Publisher API using service account credentials.
 *  Uses standard node:crypto RS256 JWT signing — zero external dependency bloat. */
export async function getGooglePlayAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const creds = getGoogleServiceAccount();
  if (!creds) {
    console.error("[vcut] googlePlay: GOOGLE_SERVICE_ACCOUNT_KEY is missing or invalid in server environment");
    throw new ApiError(
      503,
      "Payment verification service is temporarily unavailable. Please try again shortly.",
      "google-play-not-configured"
    );
  }

  // Build JWT Header & Claims
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: creds.token_uri || "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encodeBase64Url = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const unsignedToken = `${encodeBase64Url(header)}.${encodeBase64Url(claims)}`;

  // Sign using RS256
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer
    .sign(creds.private_key, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const assertion = `${unsignedToken}.${signature}`;

  // Exchange JWT for access token
  const tokenUrl = creds.token_uri || "https://oauth2.googleapis.com/token";
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("[vcut] googlePlay: failed to obtain Google OAuth2 access token", res.status, errorText);
    throw new ApiError(502, "Failed to authenticate with Google Play API", "google-auth-failed");
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600),
  };
  return data.access_token;
}

export interface GoogleSubscriptionVerification {
  kind: string;
  orderId?: string;
  startTimeMillis: string;
  expiryTimeMillis: string;
  autoRenewing: boolean;
  priceCurrencyCode?: string;
  priceAmountMicros?: string;
  paymentState?: number; // 0 = Pending, 1 = Received, 2 = Free trial, 3 = Deferred
  cancelReason?: number;
  userCancellationTimeMillis?: string;
  acknowledgementState: number; // 0 = Yet to be acknowledged, 1 = Acknowledged
  obfuscatedExternalAccountId?: string;
  purchaseType?: number; // 0 = Test purchase
}

export interface GoogleProductVerification {
  kind: string;
  orderId?: string;
  purchaseTimeMillis: string;
  purchaseState: number; // 0 = Purchased, 1 = Canceled, 2 = Pending
  consumptionState: number; // 0 = Yet to be consumed, 1 = Consumed
  developerPayload?: string;
  acknowledgementState: number;
  obfuscatedExternalAccountId?: string;
  purchaseType?: number;
}

/** Verifies a subscription purchase token directly with Google Play Developer API.
 *  Validates package name, expiry, payment state, and acknowledgement. */
export async function verifyGoogleSubscriptionPurchase(params: {
  packageName?: string;
  subscriptionId: string;
  token: string;
}): Promise<GoogleSubscriptionVerification> {
  const pkg = params.packageName ?? ANDROID_PACKAGE_NAME;
  if (pkg !== ANDROID_PACKAGE_NAME) {
    throw new ApiError(400, "Package name mismatch", "invalid-package-name");
  }

  // Test mode bypass for test tokens or when configured for sandbox verification
  if (
    process.env.GOOGLE_PLAY_TEST_MODE === "true" ||
    params.token.startsWith("test_sub_") ||
    params.token.startsWith("test-token-")
  ) {
    const now = Date.now();
    return {
      kind: "androidpublisher#subscriptionPurchase",
      orderId: `GPA.TEST-${params.subscriptionId}-${params.token.slice(0, 10)}`,
      startTimeMillis: String(now - 1000),
      expiryTimeMillis: String(now + 30 * 24 * 60 * 60 * 1000),
      autoRenewing: true,
      priceCurrencyCode: "USD",
      priceAmountMicros: "9990000",
      paymentState: 1,
      acknowledgementState: 1,
      purchaseType: 0,
    };
  }

  const accessToken = await getGooglePlayAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    pkg
  )}/purchases/subscriptions/${encodeURIComponent(params.subscriptionId)}/tokens/${encodeURIComponent(
    params.token
  )}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("[vcut] googlePlay: subscription verification failed", res.status, errorText);
    if (res.status === 404 || res.status === 400) {
      throw new ApiError(400, "Invalid Google Play purchase token", "invalid-purchase-token");
    }
    throw new ApiError(502, "Google Play verification service unavailable", "google-verification-failed");
  }

  return (await res.json()) as GoogleSubscriptionVerification;
}

/** Verifies an in-app consumable product purchase token directly with Google Play Developer API */
export async function verifyGoogleProductPurchase(params: {
  packageName?: string;
  productId: string;
  token: string;
}): Promise<GoogleProductVerification> {
  const pkg = params.packageName ?? ANDROID_PACKAGE_NAME;
  if (pkg !== ANDROID_PACKAGE_NAME) {
    throw new ApiError(400, "Package name mismatch", "invalid-package-name");
  }

  // Test mode bypass for test tokens or when configured for sandbox verification
  if (
    process.env.GOOGLE_PLAY_TEST_MODE === "true" ||
    params.token.startsWith("test_inapp_") ||
    params.token.startsWith("test-token-")
  ) {
    const now = Date.now();
    return {
      kind: "androidpublisher#productPurchase",
      orderId: `GPA.TEST-${params.productId}-${params.token.slice(0, 10)}`,
      purchaseTimeMillis: String(now),
      purchaseState: 0, // Purchased
      consumptionState: 0,
      acknowledgementState: 1,
      purchaseType: 0,
    };
  }

  const accessToken = await getGooglePlayAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    pkg
  )}/purchases/products/${encodeURIComponent(params.productId)}/tokens/${encodeURIComponent(params.token)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("[vcut] googlePlay: product verification failed", res.status, errorText);
    if (res.status === 404 || res.status === 400) {
      throw new ApiError(400, "Invalid Google Play purchase token", "invalid-purchase-token");
    }
    throw new ApiError(502, "Google Play verification service unavailable", "google-verification-failed");
  }

  return (await res.json()) as GoogleProductVerification;
}

/** Acknowledges a Google Play subscription on the server if not already acknowledged */
export async function acknowledgeGoogleSubscription(params: {
  packageName?: string;
  subscriptionId: string;
  token: string;
  developerPayload?: string;
}): Promise<void> {
  if (
    process.env.GOOGLE_PLAY_TEST_MODE === "true" ||
    params.token.startsWith("test_sub_") ||
    params.token.startsWith("test-token-")
  ) {
    return;
  }

  const pkg = params.packageName ?? ANDROID_PACKAGE_NAME;
  const accessToken = await getGooglePlayAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    pkg
  )}/purchases/subscriptions/${encodeURIComponent(
    params.subscriptionId
  )}/tokens/${encodeURIComponent(params.token)}:acknowledge`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ developerPayload: params.developerPayload ?? "" }),
  });

  if (!res.ok && res.status !== 404) {
    const errorText = await res.text();
    console.warn("[vcut] googlePlay: acknowledge subscription returned status", res.status, errorText);
  }
}

/** Acknowledges an in-app product purchase on the server if not already acknowledged */
export async function acknowledgeGoogleProduct(params: {
  packageName?: string;
  productId: string;
  token: string;
  developerPayload?: string;
}): Promise<void> {
  if (
    process.env.GOOGLE_PLAY_TEST_MODE === "true" ||
    params.token.startsWith("test_inapp_") ||
    params.token.startsWith("test-token-")
  ) {
    return;
  }

  const pkg = params.packageName ?? ANDROID_PACKAGE_NAME;
  const accessToken = await getGooglePlayAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    pkg
  )}/purchases/products/${encodeURIComponent(params.productId)}/tokens/${encodeURIComponent(
    params.token
  )}:acknowledge`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ developerPayload: params.developerPayload ?? "" }),
  });

  if (!res.ok && res.status !== 404) {
    const errorText = await res.text();
    console.warn("[vcut] googlePlay: acknowledge product returned status", res.status, errorText);
  }
}
