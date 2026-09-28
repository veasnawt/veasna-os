"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sessionFetch, useSupabaseSession } from "@veasnawt/auth";
import { TemplateDraftApp, VCutApp } from "@veasnawt/vcut";

function HostedEditorAccess({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  const router = useRouter();
  const { user } = useSupabaseSession();
  const userId = user?.id;
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; status: "allowed" | "sign-in" | "error" } | null>(null);
  const key = `${projectId}:${userId ?? ""}`;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void sessionFetch(`/api/vcut/project/editor-access?projectId=${encodeURIComponent(projectId)}`)
      .then((response) => {
        if (!active) return;
        if (response.ok) setResult({ key, status: "allowed" });
        else if (response.status === 403) router.replace(`/review/${encodeURIComponent(projectId)}`);
        else setResult({ key, status: response.status === 401 ? "sign-in" : "error" });
      })
      .catch(() => { if (active) setResult({ key, status: "error" }); });
    return () => { active = false; };
  }, [projectId, userId, key, retry, router]);

  if (user === undefined || (user && result?.key !== key)) {
    return <main className="flex h-dvh items-center justify-center bg-[#0a0c10] text-sm text-white/55">Checking project access…</main>;
  }
  if (!user || result?.status === "sign-in") {
    return <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-[#0a0c10] text-white">
      <p>Sign in to edit this project.</p>
      <a href={`/login?next=${encodeURIComponent(`/edit?projectId=${projectId}`)}`} className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium">Sign in</a>
    </main>;
  }
  if (result?.status === "error") {
    return <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-[#0a0c10] text-white">
      <p>Could not check project access.</p>
      <button onClick={() => setRetry((value) => value + 1)} className="rounded-md border border-white/20 px-4 py-2 text-sm">Try again</button>
    </main>;
  }
  return children;
}

/** The editor's real entry point — embedded by a host app (BP Studio's Create page, today) via an
 *  `<iframe>` pointed at `${vcutUrl}/edit?projectId=...&projectName=...`. VCut no longer knows
 *  or cares who's embedding it; `projectId` is just an opaque key its own storage (`_lib/paths.ts`)
 *  scopes everything under, and `projectName` is display-only. `useSearchParams` needs a `Suspense`
 *  boundary in the App Router or the page fails to prerender — this route has nothing meaningful to
 *  show before the params resolve anyway, so an empty fallback is fine. */
function EditPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const projectId = params.get("projectId");
  const projectName = params.get("projectName");
  const tool = params.get("tool");
  const initialTool = tool === "captions" || tool === "music" || tool === "voiceover" ? tool : undefined;
  // "Use this template" lands here with a template, not a project — see `TemplateDraftApp`: the project
  // is only created once media is picked, then this page is replaced with that project's own URL.
  const templateId = params.get("templateId");

  // Only VCut's own standalone page (`/`) has a project list to go back to — a host app like BP
  // Studio embeds this exact same route in its own `<iframe>`, with no equivalent list of its own, so
  // showing "back to projects" there would drop the user into an unrelated, unscoped list of every
  // VCut project across every host. `window.self !== window.top` distinguishes the two safely even
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

  if (!projectId && templateId) {
    return (
      <main className="flex h-dvh flex-col overflow-hidden bg-[#0a0c10]">
        <div className="min-h-0 min-w-0 flex-1">
          <TemplateDraftApp
            templateId={templateId}
            onHome={standalone ? () => router.push(process.env.NEXT_PUBLIC_VCUT_HOSTED === "true" ? "/home" : "/") : undefined}
            onProjectCreated={(id, name) =>
              // `replace`, not `push`: Back from the new project shouldn't land on a draft of it.
              router.replace(`/edit?projectId=${encodeURIComponent(id)}&projectName=${encodeURIComponent(name)}`)
            }
          />
        </div>
      </main>
    );
  }

  if (!projectId) {
    return (
      <main className="flex h-dvh items-center justify-center bg-[#0a0c10] text-center">
        <p className="text-sm text-white/70">Missing projectId.</p>
      </main>
    );
  }

  const editor = (
    <main className="flex h-dvh flex-col overflow-hidden bg-[#0a0c10]">
      <div className="min-h-0 min-w-0 flex-1">
        <VCutApp
          projectId={projectId}
          projectName={projectName ?? undefined}
          initialTool={initialTool}
          onHome={standalone ? () => router.push(process.env.NEXT_PUBLIC_VCUT_HOSTED === "true" ? "/home" : "/") : undefined}
        />
      </div>
    </main>
  );
  return process.env.NEXT_PUBLIC_VCUT_HOSTED === "true"
    ? <HostedEditorAccess projectId={projectId}>{editor}</HostedEditorAccess>
    : editor;
}

export default function EditPage() {
  return (
    <Suspense fallback={null}>
      <EditPageContent />
    </Suspense>
  );
}
