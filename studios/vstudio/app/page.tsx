"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  clipCount: number;
}

function formatUpdatedAt(ms: number): string {
  const diffMinutes = Math.round((Date.now() - ms) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(ms).toLocaleDateString();
}

/** VStudio's own home — a real entry point now that it's a standalone app, not just something BP
 *  Studio's Create page hands a `projectId` to. Lists every project on disk (`/api/vstudio/projects`)
 *  and lets a new one be started (`POST /api/vstudio/project`) without any host app involved. A host
 *  app embedding VStudio (BP Studio, today) still skips straight to `/edit?projectId=...` directly —
 *  this page is for when VStudio is opened on its own. */
export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/vstudio/projects")
      .then((res) => res.json())
      .then((body: { projects: ProjectSummary[] }) => setProjects(body.projects))
      .catch(() => setError("Couldn't load your projects."));
  }, []);

  async function createProject() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/vstudio/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { project: { bpProjectId: string; name: string } };
      router.push(`/edit?projectId=${encodeURIComponent(body.project.bpProjectId)}&projectName=${encodeURIComponent(body.project.name)}`);
    } catch {
      setError("Couldn't create the project.");
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-12">
      <header>
        <h1 className="text-lg font-semibold text-white">VStudio</h1>
        <p className="mt-1 text-xs text-white/40">A focused video editor for short-form creative work.</p>
      </header>

      <section className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !creating) void createProject();
            }}
            placeholder="Untitled project"
            className="min-w-0 flex-1 rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-sky-400"
          />
          <button
            onClick={() => void createProject()}
            disabled={creating}
            className="shrink-0 rounded bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:opacity-50"
          >
            {creating ? "Creating…" : "New Project"}
          </button>
        </div>
        {error && <p className="text-xs text-rose-300">{error}</p>}
      </section>

      <section className="flex flex-col gap-1">
        {projects === null ? (
          <p className="text-xs text-white/40">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-xs text-white/40">No projects yet — create one above.</p>
        ) : (
          projects.map((p) => (
            <a
              key={p.id}
              href={`/edit?projectId=${encodeURIComponent(p.id)}&projectName=${encodeURIComponent(p.name)}`}
              className="flex items-center justify-between rounded px-3 py-2.5 text-sm text-white/85 transition hover:bg-white/5"
            >
              <span className="truncate">{p.name}</span>
              <span className="ml-3 shrink-0 text-xs text-white/35">
                {p.clipCount} clip{p.clipCount === 1 ? "" : "s"} · {formatUpdatedAt(p.updatedAt)}
              </span>
            </a>
          ))
        )}
      </section>
    </main>
  );
}
