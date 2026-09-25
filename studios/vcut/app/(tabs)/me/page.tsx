"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSupabaseSession } from "@veasnawt/auth";
import { getBillingStatus, openBillingPortal, startCheckout, type BillingStatus } from "@veasnawt/vcut/src/api/billing";
import { isDesktopSignInAvailable, openDesktopSignIn } from "@veasnawt/vcut/src/api/desktopAuth";
import { Avatar } from "../../_shared/Avatar";
import { authFetch, formatFileSize, HOSTED } from "../../_shared/hostedClient";

/** Same key `packages/vcut/src/store/editorStore.ts` reads/writes for the in-editor language toggle —
 *  reused here directly (not imported — this app's dashboard-level pages deliberately stay independent
 *  of the editor package, see `_shared/hostedClient.ts`'s own doc comment) so a preference set from
 *  either place is picked up by the other next time it loads. */
const LANGUAGE_STORAGE_KEY = "vcut-language";

interface LibraryUsage {
  usedBytes: number;
  capBytes: number;
}

/** The "Me" tab — account, billing, storage, and app settings in one place, absorbing what used to be
 *  the standalone `/account` page (still reachable, now just a redirect — see `account/page.tsx`) plus
 *  new content that page never had: storage usage and a language toggle. Auth-gating lives in
 *  `(tabs)/layout.tsx`, shared across every tab. */
export default function MePage() {
  const router = useRouter();
  const { user, signOut } = useSupabaseSession();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [usage, setUsage] = useState<LibraryUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "km">("en");
  const [displayName, setDisplayName] = useState("");
  const [savedDisplayName, setSavedDisplayName] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    // Read after mount on purpose: the server render can't see localStorage, so initialising `language`
    // from it directly would hydrate with a mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "km" ? "km" : "en");
  }, []);

  // Plan/credits: works everywhere a session exists, not just the hosted deployment — `billing.ts`'s
  // own `billingFetch` always calls the one live vcut.io billing backend directly, the same
  // centrally-funded account infrastructure desktop's AI-generation credits already depend on. Split
  // out from the hosted-only fetches below, which genuinely have no desktop equivalent (see each of
  // their own routes' doc comments: no per-user library/profile storage exists outside vcut.io itself).
  useEffect(() => {
    if (!user) return;
    void getBillingStatus().then(setStatus);
  }, [user]);

  useEffect(() => {
    if (!HOSTED || !user) return;
    authFetch("/api/vcut/media/library")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { usedBytes: number; capBytes: number } | null) => {
        if (body) setUsage({ usedBytes: body.usedBytes, capBytes: body.capBytes });
      })
      .catch(() => {});
    authFetch("/api/vcut/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { displayName: string | null } | null) => {
        if (body) {
          setDisplayName(body.displayName ?? "");
          setSavedDisplayName(body.displayName);
        }
      })
      .catch(() => {});
  }, [user]);

  async function saveDisplayName() {
    setSavingName(true);
    try {
      const res = await authFetch("/api/vcut/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { displayName: string | null };
      setDisplayName(body.displayName ?? "");
      setSavedDisplayName(body.displayName);
    } catch {
      setError("Couldn't save your name — try again in a moment.");
    } finally {
      setSavingName(false);
    }
  }

  function changeLanguage(next: "en" | "km") {
    setLanguage(next);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
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
  const usagePercent = usage && usage.capBytes > 0 ? Math.min(100, Math.round((usage.usedBytes / usage.capBytes) * 100)) : 0;

  return (
    <main className="mx-auto max-w-sm px-4 py-8 sm:py-12">
      <h1 className="text-lg font-semibold text-white">Me</h1>

      {/* Desktop's own sign-in entry point — the hosted web build never reaches this: a signed-out
          visitor there is already redirected to `/login` by `(tabs)/layout.tsx`'s own gate before this
          page ever renders. Same `vcut://` system-browser round trip `VCutApp.tsx`'s header button
          already uses; `(tabs)/layout.tsx` is what actually catches its return now (see that file's own
          doc comment) so this works even though no project is open. */}
      {!HOSTED && user === null && isDesktopSignInAvailable() && (
        <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-medium text-white">Sign in to VCut</p>
          <p className="mt-1.5 text-xs leading-relaxed text-white/50">Sync your Pro plan and AI credits across devices.</p>
          <button onClick={openDesktopSignIn} className="btn-brand-gradient mt-4 rounded-md px-3.5 py-2 text-xs font-semibold text-white">
            Sign in
          </button>
        </div>
      )}

      {user && <p className="mt-1.5 text-xs text-white/40">{user.email}</p>}

      {HOSTED && user && (
        <div className="mt-6 flex items-center gap-3">
          <Avatar seed={user.id} displayName={displayName} size={40} />
          <div className="flex flex-1 gap-2">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your creator name"
              className="flex-1 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
            {displayName.trim() !== (savedDisplayName ?? "") && (
              <button
                onClick={() => void saveDisplayName()}
                disabled={savingName}
                className="shrink-0 rounded-md bg-white/10 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
              >
                {savingName ? "…" : "Save"}
              </button>
            )}
          </div>
        </div>
      )}
      {HOSTED && user && (
        <p className="mt-1.5 text-[11px] text-white/35">Shown on any template you publish — Discover, comments, and your own creator page.</p>
      )}

      {user && !status && <p className="mt-8 text-center text-xs text-white/40">Loading…</p>}

      {status && (
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
            className="btn-brand-gradient mt-4 w-full rounded-md py-2.5 text-sm font-semibold text-white transition disabled:cursor-default disabled:opacity-50"
          >
            {busy ? "One moment…" : isPro ? "Manage billing" : "Upgrade to Pro"}
          </button>

          {usage && (
            <div className="mt-6">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span>Storage</span>
                <span>
                  {formatFileSize(usage.usedBytes)} / {formatFileSize(usage.capBytes)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${usagePercent > 90 ? "bg-amber-400" : "bg-sky-400"}`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-8">
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/40">Language</span>
        <div className="flex gap-2">
          {(["en", "km"] as const).map((code) => (
            <button
              key={code}
              onClick={() => changeLanguage(code)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                language === code
                  ? "border-sky-400 bg-sky-500/10 text-white"
                  : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25"
              }`}
            >
              {code === "en" ? "English" : "ខ្មែរ"}
            </button>
          ))}
        </div>
      </div>

      {user && (
        <button
          // Desktop has nowhere to redirect TO on sign-out (`/login` is the hosted web flow's own
          // page — desktop's own sign-IN never navigates there either, see the button above); staying
          // on this same tab with `user` now `null` is correct there, same as any other state change.
          onClick={() => void signOut().then(() => HOSTED && router.replace("/login"))}
          className="mt-8 w-full rounded-md border border-white/10 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white"
        >
          Sign out
        </button>
      )}
    </main>
  );
}
