"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSupabaseSession } from "@veasnawt/auth";
import { getBillingStatus, openBillingPortal, startCheckout, type BillingStatus } from "@veasnawt/vcut/src/api/billing";

/** Where a signed-in user manages their VCut Pro subscription — reachable from `VCutApp.tsx`'s header
 *  (see that file's own Sign out button for the identical "only meaningful in the hosted web build"
 *  reasoning; this page itself only exists in `studios/vcut`, not the shared package, since desktop/
 *  mobile open the SAME hosted URL rather than rendering their own copy of this UI — see
 *  `packages/vcut/src/api/billing.ts`'s own doc comment on why billing always targets one origin). */
export default function AccountPage() {
  const router = useRouter();
  const { user } = useSupabaseSession();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user === null) router.replace("/login");
  }, [user, router]);

  useEffect(() => {
    if (user) void getBillingStatus().then(setStatus);
  }, [user]);

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

  if (!user || !status) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#0a0c10] text-white/40">
        <p className="text-sm">Loading…</p>
      </main>
    );
  }

  const isPro = status.plan === "pro";

  return (
    <main className="flex min-h-dvh flex-col bg-[#0a0c10] text-white">
      {/* A real top nav row, not part of the centered card below — putting it INSIDE that
          vertically-centered block (the original approach) meant it floated wherever the block
          happened to land on a tall viewport, often nowhere near "Your account" beneath it, instead
          of reading as a stable top-of-page "back" affordance the way it does here. `/projects` (not
          browser history) — the same "home" a signed-in visitor to `/` already redirects to
          (`page.tsx`'s own `LandingPage`) — so this works the same regardless of how the user
          actually arrived here, confirmed a real gap since this page had no way back at all before. */}
      <div className="px-4 pt-4">
        <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-white/40 transition hover:text-white">
          ← Back to your projects
        </Link>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <h1 className="text-center text-lg font-semibold">Your account</h1>
          <p className="mt-1.5 text-center text-xs text-white/40">{user.email}</p>

          <div className="mt-8 rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Plan</span>
              <span className={`text-sm font-semibold ${isPro ? "text-sky-300" : "text-white"}`}>{isPro ? "VCut Pro" : "Free"}</span>
            </div>
            {isPro && status.currentPeriodEnd && (
              <p className="mt-1.5 text-[11px] text-white/35">Renews {new Date(status.currentPeriodEnd).toLocaleDateString()}</p>
            )}
            {/* Credits power Auto Captions and Remove Object today (see _lib/credits.ts) — shown here
                regardless of plan, since free users get a small monthly taste too, not zero. */}
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-sm text-white/60">Credits</span>
              <span className="text-sm font-semibold text-white">{status.creditsRemaining}</span>
            </div>
            <p className="mt-1 text-[11px] text-white/35">Refills {new Date(status.creditsResetAt).toLocaleDateString()}</p>
          </div>

          {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}

          <button
            onClick={() => void (isPro ? manageBilling() : upgrade())}
            disabled={busy}
            className="btn-brand-gradient mt-4 w-full rounded-md py-2.5 text-sm font-semibold text-white transition disabled:cursor-default disabled:opacity-50"
          >
            {busy ? "One moment…" : isPro ? "Manage billing" : "Upgrade to Pro"}
          </button>
        </div>
      </div>
    </main>
  );
}
