"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@veasna/vstudio/src/ui/ConfirmDialog";

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
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/vstudio/projects")
      .then((res) => res.json())
      .then((body: { projects: ProjectSummary[] }) => setProjects(body.projects))
      .catch(() => setError("Couldn't load your projects."));
  }, []);

  const filtered = useMemo(() => {
    if (!projects) return projects;
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, search]);

  async function deleteProject(project: ProjectSummary) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/vstudio/project?projectId=${encodeURIComponent(project.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setProjects((prev) => (prev ? prev.filter((p) => p.id !== project.id) : prev));
      setPendingDelete(null);
    } catch {
      setError("Couldn't delete that project.");
    } finally {
      setDeleting(false);
    }
  }

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
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-8 sm:gap-8 sm:px-6 sm:py-12">
      <header>
        <h1 className="text-lg font-semibold text-white">VStudio</h1>
        <p className="mt-1 text-xs text-white/40">A focused video editor for short-form creative work.</p>
      </header>

      <section className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !creating) void createProject();
            }}
            placeholder="Untitled project"
            className="min-w-0 flex-1 rounded border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-sky-400 sm:py-2"
          />
          <button
            onClick={() => void createProject()}
            disabled={creating}
            className="shrink-0 rounded bg-sky-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-400 disabled:opacity-50 sm:py-2"
          >
            {creating ? "Creating…" : "New Project"}
          </button>
        </div>
        {error && <p className="text-xs text-rose-300">{error}</p>}
      </section>

      {projects !== null && projects.length > 0 && (
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearch("");
            }}
            placeholder={`Search ${projects.length} project${projects.length === 1 ? "" : "s"}…`}
            aria-label="Search projects"
            className="w-full rounded border border-white/10 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-sky-400"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-white/40 hover:text-white/80"
            >
              ✕
            </button>
          )}
        </div>
      )}

      <section className="flex flex-col gap-1">
        {projects === null ? (
          <p className="text-xs text-white/40">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-xs text-white/40">No projects yet — create one above.</p>
        ) : filtered && filtered.length === 0 ? (
          <p className="text-xs text-white/40">No projects match &ldquo;{search}&rdquo;.</p>
        ) : (
          filtered?.map((p) => (
            <div key={p.id} className="group flex items-center rounded transition hover:bg-white/5">
              <Link
                href={`/edit?projectId=${encodeURIComponent(p.id)}&projectName=${encodeURIComponent(p.name)}`}
                className="flex min-w-0 flex-1 items-center justify-between px-3 py-2.5 text-sm text-white/85"
              >
                <span className="truncate">{p.name}</span>
                <span className="ml-3 shrink-0 text-xs text-white/35">
                  {p.clipCount} clip{p.clipCount === 1 ? "" : "s"} · {formatUpdatedAt(p.updatedAt)}
                </span>
              </Link>
              <button
                onClick={() => setPendingDelete(p)}
                aria-label={`Delete ${p.name}`}
                title="Delete project"
                className="mr-1 shrink-0 rounded p-2 text-white/25 opacity-0 transition hover:bg-white/10 hover:text-rose-300 focus-visible:opacity-100 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
                </svg>
              </button>
            </div>
          ))
        )}
      </section>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete project?"
          message={`"${pendingDelete.name}" and all its imported media will be permanently deleted. This can't be undone.`}
          confirmLabel={deleting ? "Deleting…" : "Delete"}
          onConfirm={() => void deleteProject(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </main>
  );
}
