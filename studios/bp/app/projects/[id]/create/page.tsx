"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { HOSTED_VCUT_URL, resolveVCutIntegration, vcutProjectUrl } from "@veasnawt/integrations";

import type { Project } from "@/types/project";

function subscribeProjects(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function projectsSnapshot() {
  return localStorage.getItem("bp-projects") ?? "[]";
}

/** Launch the independent editor while keeping BP projects available locally. */
export default function CreatePage() {
  const { id } = useParams<{ id: string }>();
  const storedProjects = useSyncExternalStore(subscribeProjects, projectsSnapshot, () => null);
  const checked = storedProjects !== null;
  const project = storedProjects === null ? null :
    (JSON.parse(storedProjects) as Project[]).find((item) => item.id === id) ?? null;
  const [integration, setIntegration] = useState(() => resolveVCutIntegration());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/vcut-url")
      .then((res) => {
        if (!res.ok) throw new Error("Configuration unavailable");
        return res.json();
      })
      .then((body: { url?: unknown }) => {
        if (!cancelled && typeof body.url === "string") setIntegration(resolveVCutIntegration(body.url));
      })
      .catch(() => {
        // Keep the hosted launcher usable if the optional configuration endpoint fails.
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
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-8 text-center text-white">
        <h1 className="text-2xl font-semibold">Create with VCut</h1>
        <p className="max-w-lg text-sm text-white/60">
          {integration.mode === "local"
            ? "Open this project in your separately running local VCut editor."
            : "VCut opens separately. Your BP script stays here; hosted VCut has its own projects and account."}
        </p>
        <a href={vcutProjectUrl(integration, id, project.title)} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-sky-500 px-5 py-3 text-sm font-medium text-white hover:bg-sky-400">
          {integration.mode === "local" ? "Open local VCut" : "Open VCut"}
        </a>
        {integration.mode === "local" && (
          <p className="max-w-lg text-xs text-white/60">
            If the local editor is unavailable, start it and try again, or <a href={HOSTED_VCUT_URL} target="_blank" rel="noopener noreferrer" className="text-sky-400 underline">open VCut online</a>. Online projects are stored separately.
          </p>
        )}
      </div>
    </main>
  );
}
