"use client";

import { Suspense, useEffect, useRef, useState } from "react";
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
 *  sign-in — the ONLY thing this flag changes is what happens next, once `user` becomes non-null.
 *  The Android app uses the same mode (`packages/vcut/src/api/nativeAuth.ts`) — Google refuses to sign
 *  anyone in inside an app's WebView.
 *
 *  `&provider=google`: start Google sign-in straight away (the app's own "Continue with Google" button
 *  already was the choice) — unless this browser is already signed in, which hands off immediately. */
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
  const autoGoogle = searchParams.get("provider") === "google";
  const { user } = useSupabaseSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoffUrl, setHandoffUrl] = useState<string | null>(null);
  const autoGoogleStarted = useRef(false);

  function isPasswordAccount(emailStr: string): boolean {
    const norm = emailStr.trim().toLowerCase();
    return norm === "test@vcut.io" || norm.endsWith("@vcut.io");
  }

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
      const url = `vcut://auth-callback#${params.toString()}`;
      // Also shown as a button: browsers (Chrome on Android especially) may block a script-driven jump
      // into an app that no tap started, and a desktop browser's "Open VCut?" prompt can be dismissed.
      setHandoffUrl(url);
      window.location.href = url;
    });
  }, [user, isDesktop, router]);

  // `user === null` (not `undefined`) means the session check finished and nobody's signed in here.
  useEffect(() => {
    if (!autoGoogle || user !== null || autoGoogleStarted.current) return;
    autoGoogleStarted.current = true;
    // Drop `provider` first, so pressing Back from Google's page shows the choices rather than bouncing
    // straight back to Google again.
    window.history.replaceState(null, "", isDesktop ? "/login?desktop=1" : "/login");
    void continueWithGoogle();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, when the session check settles
  }, [autoGoogle, user]);

  async function sendMagicLink() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Sign-in isn't configured for this deployment.");
      return;
    }
    const trimmed = email.trim();
    if (!trimmed) return;
    if (isPasswordAccount(trimmed)) {
      setShowPassword(true);
      setError(null);
      return;
    }
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

  async function handlePasswordSignIn() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Sign-in isn't configured for this deployment.");
      return;
    }
    const trimmed = email.trim();
    if (!trimmed || !password) return;
    setSending(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });
    setSending(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
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

        {user && isDesktop ? (
          <div className="mt-8 rounded-lg border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/70">
            <p>
              Signed in{user.email ? <> as <span className="text-white">{user.email}</span></> : null}.
            </p>
            {handoffUrl && (
              <a href={handoffUrl} className="btn-brand-gradient mt-4 block w-full rounded-md py-2.5 text-sm font-semibold text-white">
                Open VCut
              </a>
            )}
            <p className="mt-3 text-xs text-white/40">You can close this tab once VCut opens.</p>
          </div>
        ) : autoGoogle && !error ? (
          <p className="mt-8 text-center text-sm text-white/50">Opening Google…</p>
        ) : sent ? (
          <div className="mt-8 rounded-lg border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/70">
            Check <span className="text-white">{email}</span> for a sign-in link.
          </div>
        ) : showPassword ? (
          <div className="mt-8 space-y-3">
            <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70">
              <span className="truncate font-medium text-white">{email}</span>
              <button
                type="button"
                onClick={() => {
                  setShowPassword(false);
                  setPassword("");
                  setError(null);
                }}
                className="ml-2 font-medium text-sky-400 transition hover:text-sky-300"
              >
                Change
              </button>
            </div>

            <div className="relative">
              <input
                type={showPasswordText ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !sending) void handlePasswordSignIn();
                }}
                placeholder="Password"
                autoFocus
                autoComplete="current-password"
                className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 pr-10 text-sm text-white placeholder:text-white/30 outline-none focus:border-sky-400"
              />
              <button
                type="button"
                onClick={() => setShowPasswordText(!showPasswordText)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-white/40 transition hover:text-white/70"
                aria-label={showPasswordText ? "Hide password" : "Show password"}
              >
                {showPasswordText ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            {error && <p className="text-xs text-amber-200/80">{error}</p>}

            <button
              onClick={() => void handlePasswordSignIn()}
              disabled={sending || !password}
              className="btn-brand-gradient w-full rounded-md py-2.5 text-sm font-semibold text-white transition disabled:cursor-default disabled:opacity-50"
            >
              {sending ? "Signing in…" : "Sign in"}
            </button>
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            <button
              onClick={() => void continueWithGoogle()}
              className="flex w-full items-center justify-center gap-2.5 rounded-md border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
            >
              {/* Google's own multicolor "G" mark, as its sign-in branding guidelines ask for — inline,
                  so there's no extra request and it can't fail to load. */}
              <svg aria-hidden width="18" height="18" viewBox="0 0 48 48" className="shrink-0">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
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

            {error && <p className="text-xs text-amber-200/80">{error}</p>}

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
