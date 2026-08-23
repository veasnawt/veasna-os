"use client";

import { useEffect } from "react";
import { reportError } from "@veasna/vstudio";

/** Same shape as `error.tsx`, but for the rare case that crashes the ROOT LAYOUT itself (`layout.tsx`)
 *  — Next's own convention requires this to render its own `<html>`/`<body>`, since a layout-level
 *  crash means the real root layout never rendered at all. In practice this should almost never fire
 *  (`error.tsx` catches everything below the layout, and `ErrorBoundary` inside `VStudioApp` catches
 *  everything below THAT) — it exists for completeness, not because it's expected to be hit often. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError("nextjs-global-error-boundary", error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="flex h-full min-h-full flex-col items-center justify-center gap-4 bg-[#0a0c10] p-6 text-center text-white">
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
      </body>
    </html>
  );
}
