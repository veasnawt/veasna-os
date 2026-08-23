"use client";

import { useEffect } from "react";
import { reportError } from "@veasna/vstudio";

/** Next's own App Router error-boundary convention — a second layer above the manual
 *  `ErrorBoundary` `VStudioApp` wraps its own export in (`packages/vstudio/src/ui/VStudioApp.tsx`).
 *  Catches anything that somehow escapes that boundary, plus errors in this route's own page code
 *  BEFORE `VStudioApp` even mounts (e.g. a future addition to `edit/page.tsx` throwing ahead of the
 *  `<VStudioApp>` render). Reports through the exact same `reportError` the inner boundary uses, so
 *  both land in the same crash log regardless of which layer actually caught it. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError("nextjs-error-boundary", error, { digest: error.digest });
  }, [error]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-[#0a0c10] p-6 text-center text-white">
      <h1 className="text-base font-semibold">Something went wrong</h1>
      <p className="max-w-md text-xs text-white/60">
        VStudio hit an unexpected error and couldn&apos;t continue. Your project&apos;s last save is safe — reloading will get you back to it.
      </p>
      <p className="max-w-md truncate text-[11px] text-white/30" title={error.message}>
        {error.message}
      </p>
      <button onClick={reset} className="rounded-md bg-sky-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-400">
        Reload
      </button>
    </div>
  );
}
