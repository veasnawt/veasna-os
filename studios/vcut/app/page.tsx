"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSupabaseSession } from "@veasnawt/auth";

const HOSTED = process.env.NEXT_PUBLIC_VCUT_HOSTED === "true";

/** A signed-in visitor goes straight to their Home tab rather than re-reading the pitch — the
 *  landing page below is for someone deciding whether to sign up, not someone who already has. */
function LandingPage() {
  const router = useRouter();
  const { user } = useSupabaseSession();

  useEffect(() => {
    if (user) router.replace("/home");
  }, [user, router]);

  // `undefined` means the session hasn't been read yet (a moment on every page load). Showing the sign-in pitch during it
  // made a signed-in person coming back from the editor see the logged-out page for about a second; so show nothing
  // (just the app background) until the session is known, and nothing at all once we're already redirecting to Home.
  if (user === undefined || user) return <main className="min-h-dvh bg-[#0a0c10]" aria-busy="true" />;

  return (
    <main className="min-h-dvh bg-[#0a0c10] text-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="flex items-center gap-2 text-base font-semibold">
          <img src="/vcut-logo.png" alt="" className="h-6 w-6" />
          VCut
        </span>
        <Link
          href="/login"
          className="rounded-md bg-sky-500 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-sky-400"
        >
          Sign in
        </Link>
      </header>

      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pb-20 pt-16 text-center sm:pt-24">
        <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">A focused video editor for short-form creative work.</h1>
        <p className="mt-5 max-w-xl text-sm text-white/50 sm:text-base">
          Cut, caption, and export vertical video fast — timeline editing, keyframed effects, and Khmer-script text
          support, right in your browser.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="btn-brand-gradient rounded-md px-6 py-3 text-sm font-semibold text-white transition"
          >
            Start editing — it&rsquo;s free
          </Link>
          {/* `/dl/desktop` — this app's own tiny redirect route (see its own doc comment), not a raw
              GitHub link: the installer lives in GitHub Releases on the dedicated veasnawt/vcut repo
              (packages/vcut's own submodule repo, now public — free hosting, and the standard place a
              desktop app's own users already expect installers/changelogs), but that repo ALSO carries
              mobile's releases in the same tag namespace, which made both a raw `/releases/latest` link
              (real, confirmed bug: served an Android APK to a Windows visitor once) and a hardcoded
              version-pinned link (correct today, silently stale on the very next desktop release) the
              wrong choice. The redirect route resolves the real latest desktop release fresh every
              time, so this link needs no maintenance at all going forward. */}
          <a
            href="/dl/desktop"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Download Desktop App
          </a>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-24 sm:grid-cols-3">
        {[
          { title: "Full timeline editor", body: "Multi-track video, audio, and text, transitions, keyframed effects, and color grading." },
          { title: "Fast export", body: "Renders straight to MP4, ready to post — no waiting on a queue." },
          { title: "Works everywhere", body: "In your browser today, with desktop and mobile apps for offline editing." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <h3 className="text-sm font-semibold text-white">{f.title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-white/45">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-xs text-white/30">
        © {new Date().getFullYear()} VCut
      </footer>
    </main>
  );
}

/** Rendered from `/` — what this actually shows depends entirely on `NEXT_PUBLIC_VCUT_HOSTED`
 *  (see `client.ts`'s own doc comment on the same flag). Unset (desktop's bundled build, local dev)
 *  redirects straight to `/home` — the same Home/Projects/Templates/Me tabbed shell the hosted web
 *  app already gives a signed-in visitor, so desktop gets the identical tab bar instead of the old
 *  bare `ProjectsDashboard` with no chrome around it. No auth gate needed here (unlike the hosted
 *  branch below): `(tabs)/layout.tsx`'s own sign-in redirect only fires `HOSTED && user === null`,
 *  a no-op when unhosted. Set (the public web deployment) makes `/` a marketing landing page instead,
 *  since a signed-out visitor there has nothing to dashboard; the project list moves to `/projects`,
 *  reachable once signed in. */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (!HOSTED) router.replace("/home");
  }, [router]);

  if (!HOSTED) return null; // redirecting
  return <LandingPage />;
}
