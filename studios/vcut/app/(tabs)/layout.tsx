"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSupabaseSession, getSupabaseBrowserClient } from "@veasnawt/auth";
import { subscribeToDesktopAuthCallback } from "@veasnawt/vcut/src/api/desktopAuth";
import { HOSTED } from "../_shared/hostedClient";
import { TabBar, TabBarSpacer } from "../_shared/TabBar";

/** Shared chrome for the four top-level sections a signed-in visitor lands in — Home, Projects,
 *  Templates, Me (`_shared/TabBar.tsx`) — a route GROUP (`(tabs)`, stripped from the URL) rather than
 *  nesting these under a real path segment, since `/home`/`/projects`/`/templates`/`/me` are meant to
 *  read as peers, not as children of some shared parent route. `/edit`, `/login`, and the bare `/`
 *  marketing page all stay OUTSIDE this group deliberately — none of them want the tab bar (the editor
 *  needs its own full-screen chrome, the other two have nothing to navigate between yet).
 *
 *  Also owns the sign-in gate every one of these four pages needs identically — factored up here
 *  rather than each page repeating the same `user === null → redirect` / `user === undefined →
 *  loading` dance `projects/page.tsx` used to do on its own before this group existed. */
export default function TabsLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user } = useSupabaseSession();

  useEffect(() => {
    if (HOSTED && user === null) router.replace("/login");
  }, [user, router]);

  // Desktop's own sign-in round trip (`Me` tab's own button — see that page) lands back here through
  // Electron's `vcut://auth-callback` handling in `main.ts`, same as `VCutApp.tsx`'s identical effect
  // for when sign-in is triggered from INSIDE an open project. That one only runs while `VCutApp` is
  // actually mounted (a project open) — this group's four tabs are reachable without ever opening one,
  // so without this copy here too, the browser round trip would appear to hand off fine and then
  // silently do nothing on return whenever it was started from Home/Projects/Templates/Me instead of
  // the editor. A no-op everywhere `window.veasnaAuth` doesn't exist (hosted web, native mobile).
  useEffect(() => {
    return subscribeToDesktopAuthCallback(({ accessToken, refreshToken }) => {
      void getSupabaseBrowserClient()?.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    });
  }, []);

  if (HOSTED && user === undefined) {
    return <main className="flex min-h-dvh items-center justify-center bg-[#0a0c10] text-xs text-white/40">Loading…</main>;
  }
  if (HOSTED && !user) return null; // redirecting

  return (
    <div className="min-h-dvh bg-[#0a0c10] text-white">
      <TabBar />
      <TabBarSpacer>{children}</TabBarSpacer>
    </div>
  );
}
