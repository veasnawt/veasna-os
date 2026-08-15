"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VStudioApp } from "@veasna/vstudio";

/** The editor's real entry point — embedded by a host app (BP Studio's Create page, today) via an
 *  `<iframe>` pointed at `${vstudioUrl}/edit?projectId=...&projectName=...`. VStudio no longer knows
 *  or cares who's embedding it; `projectId` is just an opaque key its own storage (`_lib/paths.ts`)
 *  scopes everything under, and `projectName` is display-only. `useSearchParams` needs a `Suspense`
 *  boundary in the App Router or the page fails to prerender — this route has nothing meaningful to
 *  show before the params resolve anyway, so an empty fallback is fine. */
function EditPageContent() {
  const params = useSearchParams();
  const projectId = params.get("projectId");
  const projectName = params.get("projectName");

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
        <VStudioApp projectId={projectId} projectName={projectName ?? undefined} />
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
