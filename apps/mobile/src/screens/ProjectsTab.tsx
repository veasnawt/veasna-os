import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@veasnawt/vcut/src/ui/ConfirmDialog";
import { nativeDeleteProject, nativeListProjects, type LocalProjectSummary } from "@veasnawt/vcut/src/api/nativeStorage";
import type { Project } from "@veasnawt/vcut/src/project/types";
import { formatUpdatedAt } from "../format";
import { ProjectThumbnail } from "../ProjectThumbnail";
import { NewProjectDialog } from "./NewProjectDialog";

/** The exhaustive, searchable project grid — mirrors `studios/vcut/app/ProjectsDashboard.tsx`'s own
 *  search/delete UI, built on `nativeListProjects`/`nativeDeleteProject` instead of `authFetch`-ed
 *  server routes. */
export function ProjectsTab({ onOpenProject }: { onOpenProject: (projectId: string, projectName: string) => void }) {
  const [projects, setProjects] = useState<LocalProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<LocalProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    nativeListProjects()
      .then(setProjects)
      .catch(() => setError("Couldn't load your projects."));
  }, []);

  const filtered = useMemo(() => {
    if (!projects) return projects;
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, search]);

  async function deleteProject(project: LocalProjectSummary) {
    setDeleting(true);
    try {
      await nativeDeleteProject(project.id);
      setProjects((prev) => (prev ? prev.filter((p) => p.id !== project.id) : prev));
      setPendingDelete(null);
    } catch {
      setError("Couldn't delete that project.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">Projects</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-sky-500 px-3.5 py-2 text-sm font-medium text-white"
        >
          <span aria-hidden className="text-base leading-none">
            +
          </span>
          New Project
        </button>
      </header>

      {error && <p className="text-xs text-amber-200/80">{error}</p>}

      {projects !== null && projects.length > 0 && (
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${projects.length} project${projects.length === 1 ? "" : "s"}…`}
            aria-label="Search projects"
            className="w-full rounded border border-white/10 bg-transparent px-3 py-2 text-[16px] text-white placeholder:text-white/30 outline-none focus:border-sky-400"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-white/40">
              ✕
            </button>
          )}
        </div>
      )}

      <section>
        {projects === null ? (
          !error && <p className="text-xs text-white/40">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-xs text-white/40">No projects yet — create one above.</p>
        ) : filtered && filtered.length === 0 ? (
          <p className="text-xs text-white/40">No projects match &ldquo;{search}&rdquo;.</p>
        ) : (
          <div className="columns-2 gap-4">
            {filtered?.map((p) => {
              const portrait = p.height > p.width;
              return (
                <div key={p.id} className="group mb-4 flex break-inside-avoid flex-col gap-2">
                  <button
                    onClick={() => onOpenProject(p.id, p.name)}
                    style={{ aspectRatio: `${p.width} / ${p.height}` }}
                    className="relative block w-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] text-left"
                  >
                    <ProjectThumbnail project={p} />
                    <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/70 backdrop-blur-sm">
                      {portrait ? "⬍" : "⬌"} {p.width}×{p.height}
                    </span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(p);
                      }}
                      role="button"
                      aria-label={`Delete ${p.name}`}
                      className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1.5 text-white/70 backdrop-blur-sm"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
                      </svg>
                    </span>
                  </button>

                  <button onClick={() => onOpenProject(p.id, p.name)} className="min-w-0 px-0.5 text-left">
                    <p className="truncate text-sm text-white/85">{p.name}</p>
                    <p className="text-xs text-white/35">
                      {p.clipCount} clip{p.clipCount === 1 ? "" : "s"} · {formatUpdatedAt(p.updatedAt)}
                    </p>
                  </button>
                </div>
              );
            })}
          </div>
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

      {showCreate && (
        <NewProjectDialog
          onClose={() => setShowCreate(false)}
          onCreated={(project: Project) => onOpenProject(project.bpProjectId, project.name)}
        />
      )}
    </main>
  );
}
