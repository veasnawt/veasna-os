"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VStudioApp } from "@veasna/vstudio";

/** The editor's real entry point — embedded by a host app (BP Studio's Create page, today) via an
 *  `<iframe>` pointed at `${vstudioUrl}/edit?projectId=...&projectName=...`. VStudio no longer knows
 *  or cares who's embedding it; `projectId` is just an opaque key its own storage (`_lib/paths.ts`)
 *  scopes everything under, and `projectName` is display-only. `useSearchParams` needs a `Suspense`
 *  boundary in the App Router or the page fails to prerender — this route has nothing meaningful to
 *  show before the params resolve anyway, so an empty fallback is fine. */
function EditPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const projectId = params.get("projectId");
  const projectName = params.get("projectName");

  // Only VStudio's own standalone page (`/`) has a project list to go back to — a host app like BP
  // Studio embeds this exact same route in its own `<iframe>`, with no equivalent list of its own, so
  // showing "back to projects" there would drop the user into an unrelated, unscoped list of every
  // VStudio project across every host. `window.self !== window.top` distinguishes the two safely even
  // cross-origin (only compares window identity, never reads a cross-origin property) and, unlike a
  // query-param flag set by the home page's own links, also correctly covers a bookmarked/reloaded
  // `/edit` URL opened directly in a real browser tab. Starts `false` (SSR has no `window`) and flips
  // after mount — a one-frame-late reveal beats a hydration mismatch.
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    // Deliberately a synchronous setState in an effect body, not a subscription — there's no external
    // store to subscribe to here, just a one-time fact (`window.self === window.top`) that genuinely
    // doesn't exist yet during SSR/the first client render, so it can't be computed any earlier than
    // this without risking the exact hydration mismatch the comment above already explains avoiding.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStandalone(window.self === window.top);
  }, []);

  if (!projectId) {
    return (
      <main className="flex h-dvh items-center justify-center bg-[#0a0c10] text-center">
        <p className="text-sm text-white/70">Missing projectId.</p>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[#0a0c10]">
      <div className="min-h-0 min-w-0 flex-1">
        <VStudioApp
          projectId={projectId}
          projectName={projectName ?? undefined}
          onHome={standalone ? () => router.push("/") : undefined}
        />
      </div>
    </main>
  );
}

export default function EditPage() {
  return (
    <Suspense fallback={null}>
      <EditPageContent />
    </Suspense>
  );
}
