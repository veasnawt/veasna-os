import { useEffect, useState } from "react";
import { nativeListProjects, type LocalProjectSummary } from "@veasnawt/vcut/src/api/nativeStorage";
import type { Project } from "@veasnawt/vcut/src/project/types";
import { formatUpdatedAt } from "../format";
import { ProjectThumbnail } from "../ProjectThumbnail";
import { NewProjectDialog } from "./NewProjectDialog";

/** Mobile's Home tab — recent projects + quick actions, mirrors `studios/vcut/app/(tabs)/home/page.tsx`
 *  (same "curated landing tab, top 6 by `updatedAt`" shape) but reads `nativeListProjects()` instead of
 *  `/api/vcut/projects`, since this app has no server of its own. */
export function HomeTab({
  onOpenProject,
  onOpenTemplates,
}: {
  onOpenProject: (projectId: string, projectName: string) => void;
  onOpenTemplates: () => void;
}) {
  const [projects, setProjects] = useState<LocalProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    nativeListProjects()
      .then(setProjects)
      .catch(() => setError("Couldn't load your projects."));
  }, []);

  const recent = projects ? [...projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6) : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-lg font-semibold text-white">Home</h1>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center justify-center gap-1.5 rounded-md bg-sky-500 px-4 py-3 text-sm font-medium text-white"
        >
          <span aria-hidden className="text-base leading-none">
            +
          </span>
          New Project
        </button>
        <button
          onClick={onOpenTemplates}
          className="flex items-center justify-center gap-1.5 rounded-md border border-white/15 px-4 py-3 text-sm font-medium text-white/80"
        >
          Browse Templates
        </button>
      </div>

      {error && <p className="mt-4 text-xs text-amber-200/80">{error}</p>}

      <div className="mt-8">
        <h2 className="text-sm font-medium text-white/70">Recent projects</h2>

        {recent === null ? (
          !error && <p className="mt-4 text-xs text-white/40">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="mt-4 text-xs text-white/40">No projects yet — create one above to get started.</p>
        ) : (
          <div className="mt-3 columns-2 gap-3">
            {recent.map((p) => (
              <button
                key={p.id}
                onClick={() => onOpenProject(p.id, p.name)}
                className="group mb-3 flex w-full break-inside-avoid flex-col gap-1.5 text-left"
              >
                <div
                  style={{ aspectRatio: `${p.width} / ${p.height}` }}
                  className="relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]"
                >
                  <ProjectThumbnail project={p} />
                </div>
                <p className="truncate text-xs text-white/85">{p.name}</p>
                <p className="text-[11px] text-white/35">{formatUpdatedAt(p.updatedAt)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <NewProjectDialog
          onClose={() => setShowCreate(false)}
          onCreated={(project: Project) => onOpenProject(project.bpProjectId, project.name)}
        />
      )}
    </main>
  );
}
