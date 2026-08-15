"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { getProjectById } from "@/lib/project-service";
import { Project } from "@/types/project";

/** BP Studio's Create stage — where a project stops being a script and becomes a video.
 *
 *  The editor itself is VStudio, a standalone app (`studios/vstudio`) this page embeds via an
 *  `<iframe>` rather than rendering in-process — see `app/api/vstudio-url/route.ts` for how its real
 *  origin is resolved. The editor fills the viewport rather than sitting inside BP's usual page
 *  chrome: a timeline needs every pixel it can get, and an editor framed by a marketing-style layout
 *  is an editor nobody can work in. A single back link is the only BP navigation kept, outside the
 *  iframe. */
export default function CreatePage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [checked, setChecked] = useState(false);
  const [vstudioUrl, setVstudioUrl] = useState<string | null>(null);

  // BP projects live in localStorage, which is browser-only — so this reads after mount rather than
  // during render.
  useEffect(() => {
    setProject(getProjectById(id) ?? null);
    setChecked(true);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/vstudio-url")
      .then((res) => res.json())
      .then((body: { url: string }) => {
        if (!cancelled) setVstudioUrl(body.url);
      })
      .catch(() => {
        if (!cancelled) setVstudioUrl("http://localhost:3002");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checked) {
    return <main className="flex h-dvh items-center justify-center bg-[#0a0c10] text-xs text-white/40">Loading…</main>;
  }

  if (!project) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-3 bg-[#0a0c10] text-center">
        <p className="text-sm text-white/70">That project doesn&apos;t exist.</p>
        <Link href="/" className="text-xs text-sky-400 underline underline-offset-4 hover:text-sky-300">
          Back to projects
        </Link>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[#0a0c10]">
      <nav className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-1.5">
        <Link
          href={`/projects/${id}`}
          className="rounded px-2 py-1 text-[11px] text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          ← {project.code}
        </Link>
      </nav>
      {/* min-w-0 alongside min-h-0: without it, a flex child defaults to `min-width: auto`, so
          VStudio's own widest descendant (Timeline's horizontally-scrolling content, easily
          1500px+) could force THIS wrapper — and this `<main>`'s scrollWidth with it — wider than
          the viewport, even though nested `overflow` rules clip it visually. That hidden width is
          what a focused element could get auto-scrolled into view against, yanking the whole page
          sideways on a plain tap. VStudioApp.tsx has the matching fix on its own side of the iframe
          boundary. */}
      <div className="min-h-0 min-w-0 flex-1">
        {vstudioUrl ? (
          <iframe
            src={`${vstudioUrl}/edit?projectId=${encodeURIComponent(id)}&projectName=${encodeURIComponent(project.title)}`}
            title="VStudio"
            className="h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-white/40">Loading editor…</div>
        )}
      </div>
    </main>
  );
}
