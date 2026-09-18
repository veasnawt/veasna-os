import { useEffect, useState } from "react";
import { useSupabaseSession } from "@veasnawt/auth";
import { getBillingStatus, openBillingPortal, startCheckout, type BillingStatus } from "@veasnawt/vcut/src/api/billing";
import { nativeStorageUsage } from "@veasnawt/vcut/src/api/nativeStorage";
import { MobileSignInDialog } from "@veasnawt/vcut/src/ui/MobileSignInDialog";
import { formatFileSize } from "../format";

const LANGUAGE_STORAGE_KEY = "vcut-language";
/** Matches `studios/vcut/app/(tabs)/me/page.tsx`'s own cap comment — device storage has no server-side
 *  quota to compare against, so this is just an informational figure, not a limit anything enforces. */
const LOCAL_STORAGE_INFO_CAP_BYTES = 5 * 1024 * 1024 * 1024;

/** Mobile's "Me" tab — account/billing (reusing the exact same `useSupabaseSession`/`MobileSignInDialog`/
 *  `billing.ts` already wired into `VCutApp.tsx`'s own header for AI-generation credits, so this is
 *  mostly new UI around already-working infrastructure), on-device storage usage (`nativeStorageUsage`,
 *  in place of the hosted "Me" tab's server-computed account library figure), and the same language
 *  toggle `MePage` already has. */
export function MeTab() {
  const { user, signOut } = useSupabaseSession();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [usedBytes, setUsedBytes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "km">("en");
  const [showSignIn, setShowSignIn] = useState(false);

  useEffect(() => {
    try {
      setLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "km" ? "km" : "en");
    } catch {
      /* private window / blocked storage — stays "en" */
    }
  }, []);

  useEffect(() => {
    nativeStorageUsage()
      .then(setUsedBytes)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    void getBillingStatus().then(setStatus);
  }, [user]);

  function changeLanguage(next: "en" | "km") {
    setLanguage(next);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* see readInitialMuted-style tolerance elsewhere in this app — not worth surfacing */
    }
  }

  async function upgrade() {
    setBusy(true);
    setError(null);
    try {
      window.location.href = await startCheckout();
    } catch {
      setError("Couldn't start checkout — try again in a moment.");
      setBusy(false);
    }
  }

  async function manageBilling() {
    setBusy(true);
    setError(null);
    try {
      window.location.href = await openBillingPortal();
    } catch {
      setError("Couldn't open the billing portal — try again in a moment.");
      setBusy(false);
    }
  }

  const isPro = status?.plan === "pro";
  const usagePercent = usedBytes === null ? 0 : Math.min(100, Math.round((usedBytes / LOCAL_STORAGE_INFO_CAP_BYTES) * 100));

  return (
    <main className="mx-auto max-w-sm px-4 py-8">
      <h1 className="text-lg font-semibold text-white">Me</h1>

      {user === undefined ? (
        <p className="mt-8 text-center text-xs text-white/40">Loading…</p>
      ) : user ? (
        <>
          <p className="mt-1.5 text-xs text-white/40">{user.email}</p>

          {!status ? (
            <p className="mt-8 text-center text-xs text-white/40">Loading…</p>
          ) : (
            <>
              <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/60">Plan</span>
                  <span className={`text-sm font-semibold ${isPro ? "text-sky-300" : "text-white"}`}>{isPro ? "VCut Pro" : "Free"}</span>
                </div>
                {isPro && status.currentPeriodEnd && (
                  <p className="mt-1.5 text-[11px] text-white/35">Renews {new Date(status.currentPeriodEnd).toLocaleDateString()}</p>
                )}
                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                  <span className="text-sm text-white/60">Credits</span>
                  <span className="text-sm font-semibold text-white">{status.creditsRemaining}</span>
                </div>
                <p className="mt-1 text-[11px] text-white/35">Refills {new Date(status.creditsResetAt).toLocaleDateString()}</p>
              </div>

              {error && <p className="mt-3 text-xs text-amber-200/80">{error}</p>}

              <button
                onClick={() => void (isPro ? manageBilling() : upgrade())}
                disabled={busy}
                className="btn-brand-gradient mt-4 w-full rounded-md py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "One moment…" : isPro ? "Manage billing" : "Upgrade to Pro"}
              </button>
            </>
          )}

          <button
            onClick={() => void signOut()}
            className="mt-8 w-full rounded-md border border-white/10 py-2.5 text-sm font-medium text-white/70"
          >
            Sign out
          </button>
        </>
      ) : (
        <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-medium text-white">Sign in to VCut</p>
          <p className="mt-1.5 text-xs leading-relaxed text-white/50">Sync your Pro plan and AI credits across devices.</p>
          <button
            onClick={() => setShowSignIn(true)}
            className="btn-brand-gradient mt-4 w-full rounded-md py-2.5 text-sm font-semibold text-white"
          >
            Sign in
          </button>
        </div>
      )}

      {usedBytes !== null && (
        <div className="mt-8">
          <div className="flex items-center justify-between text-xs text-white/50">
            <span>Storage on this device</span>
            <span>{formatFileSize(usedBytes)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-sky-400" style={{ width: `${usagePercent}%` }} />
          </div>
        </div>
      )}

      <div className="mt-8">
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/40">Language</span>
        <div className="flex gap-2">
          {(["en", "km"] as const).map((code) => (
            <button
              key={code}
              onClick={() => changeLanguage(code)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                language === code ? "border-sky-400 bg-sky-500/10 text-white" : "border-white/10 bg-white/[0.03] text-white/60"
              }`}
            >
              {code === "en" ? "English" : "ខ្មែរ"}
            </button>
          ))}
        </div>
      </div>

      {showSignIn && <MobileSignInDialog onClose={() => setShowSignIn(false)} />}
    </main>
  );
}
