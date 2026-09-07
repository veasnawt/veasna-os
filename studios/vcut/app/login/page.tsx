"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient, useSupabaseSession } from "@veasnawt/auth";

/** Email magic-link sign-in — no password to set, forget, or leak. Also the one page that has to
 *  work even before `NEXT_PUBLIC_VCUT_HOSTED` is confirmed configured, since a misconfigured hosted
 *  deploy should say so plainly here rather than fail silently deeper in the app.
 *
 *  `?desktop=1`: the desktop app's own sign-in flow (see `apps/vcut-desktop/src/main.ts` and
 *  `packages/vcut/src/api/desktopAuth.ts`) opens THIS page in the user's system browser rather than
 *  signing in inside the Electron window itself — its own bundled server's port changes every launch,
 *  which neither an emailed magic link nor a registered OAuth redirect URI can tolerate. Both sign-in
 *  methods below redirect back to this exact page (preserving `?desktop=1`) rather than `/projects`,
 *  so Supabase's client can finish the token exchange from the URL here same as any normal web
 *  sign-in — the ONLY thing this flag changes is what happens next, once `user` becomes non-null. */
export default function LoginPage() {
  // `useSearchParams` opts the tree it's called in into client-side-only rendering — Next requires a
  // `Suspense` boundary around any component that calls it, or the production build fails.
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDesktop = searchParams.get("desktop") === "1";
  const { user } = useSupabaseSession();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in (e.g. followed a bookmarked /login link, or the magic-link/OAuth redirect just
  // landed and Supabase's client already parsed the session out of the URL). For a normal web visit,
  // straight to the project list. For the desktop flow, hand the session's own tokens to the custom
  // `vcut://` protocol instead — the OS hands that off to the already-open Electron app, which is the
  // one place they actually need to end up (see `main.ts`'s `handleAuthCallbackUrl`).
  useEffect(() => {
    if (!user) return;
    if (!isDesktop) {
      router.replace("/projects");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (!session) return;
      const params = new URLSearchParams({ access_token: session.access_token, refresh_token: session.refresh_token });
      window.location.href = `vcut://auth-callback#${params.toString()}`;
    });
  }, [user, isDesktop, router]);

  async function sendMagicLink() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Sign-in isn't configured for this deployment.");
      return;
    }
    const trimmed = email.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    // Redirects back to THIS page (not `/projects`) when `isDesktop` — see this page's own top doc
    // comment for why: the token-exchange-then-`vcut://`-handoff logic above only runs from here.
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}${isDesktop ? "/login?desktop=1" : "/projects"}` : undefined },
    });
    setSending(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    setSent(true);
  }

  async function continueWithGoogle() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Sign-in isn't configured for this deployment.");
      return;
    }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: typeof window !== "undefined" ? `${window.location.origin}${isDesktop ? "/login?desktop=1" : "/projects"}` : undefined },
    });
    if (oauthError) setError(oauthError.message);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#0a0c10] px-4 text-white">
      <div className="w-full max-w-sm">
        <img src="/vcut-logo.png" alt="" className="mx-auto h-10 w-10" />
        <h1 className="mt-3 text-center text-lg font-semibold">Sign in to VCut</h1>
        <p className="mt-1.5 text-center text-xs text-white/40">Your projects, on any device.</p>

        {sent ? (
          <div className="mt-8 rounded-lg border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/70">
            Check <span className="text-white">{email}</span> for a sign-in link.
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            <button
              onClick={() => void continueWithGoogle()}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Continue with Google
            </button>

            <div className="flex items-center gap-3 py-1 text-[11px] text-white/30">
              <span className="h-px flex-1 bg-white/10" />
              or
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <label className="block">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !sending) void sendMagicLink();
                }}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-sky-400"
              />
            </label>

            {error && <p className="text-xs text-rose-300">{error}</p>}

            <button
              onClick={() => void sendMagicLink()}
              disabled={sending || !email.trim()}
              className="btn-brand-gradient w-full rounded-md py-2.5 text-sm font-semibold text-white transition disabled:cursor-default disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send sign-in link"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
