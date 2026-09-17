"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Project } from "@veasnawt/vcut/src/project/types";
import { authFetch, formatUpdatedAt, thumbnailUrl, type ProjectSummary } from "../../_shared/hostedClient";
import { NewProjectDialog } from "../../ProjectsDashboard";

/** The curated landing tab — recent projects and quick actions, not the exhaustive searchable list
 *  ("Projects" tab handles that). Fetches the same `/api/vcut/projects` listing `ProjectsDashboard`
 *  does (no dedicated "recent" endpoint — sorting client-side to the top 6 by `updatedAt` is cheap
 *  enough that a real project owns hundreds of rows before this would ever matter). */
export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    authFetch("/api/vcut/projects")
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Couldn't load your projects (${res.status}).`);
        }
        const body = (await res.json()) as { projects: ProjectSummary[] };
        setProjects(body.projects);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't load your projects."));
  }, []);

  const recent = projects ? [...projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6) : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <h1 className="text-lg font-semibold text-white">Home</h1>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-md">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center justify-center gap-1.5 rounded-md bg-sky-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-sky-400"
        >
          <span aria-hidden className="text-base leading-none">
            +
          </span>
          New Project
        </button>
        <Link
          href="/templates"
          className="flex items-center justify-center gap-1.5 rounded-md border border-white/15 px-4 py-3 text-sm font-medium text-white/80 transition hover:bg-white/5"
        >
          Browse Templates
        </Link>
      </div>

      {error && <p className="mt-4 text-xs text-amber-200/80">{error}</p>}

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-white/70">Recent projects</h2>
          {recent && recent.length > 0 && (
            <Link href="/projects" className="text-xs text-white/40 transition hover:text-white/70">
              See all →
            </Link>
          )}
        </div>

        {recent === null ? (
          // A failed load already says so above — "Loading…" under it would never go away.
          !error && <p className="mt-4 text-xs text-white/40">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="mt-4 text-xs text-white/40">No projects yet — create one above to get started.</p>
        ) : (
          // `columns-N` (CSS multi-column), not `grid grid-cols-N` (an earlier version of this line) —
          // a real reported bug: with a uniform grid, each ROW's height is forced to its TALLEST
          // cell, and these thumbnails keep their own source aspect ratio (`style={{aspectRatio: ...}}`
          // below) rather than a fixed one, so a row mixing a portrait clip next to a landscape one
          // left the shorter thumbnail's own caption sitting in a pool of dead space before the next
          // row could start — confirmed directly from a real screenshot, not reasoned about.
          // `columns-N` instead lets each COLUMN pack items back-to-back regardless of their
          // neighbors' own height, the real "Pinterest-style" masonry behavior `templates/page.tsx`'s
          // own grid already uses correctly for the identical reason — matched here rather than
          // reinvented. `break-inside-avoid` on each `Link` below (mirroring that page's own tile) is
          // what stops a single project's card from being split across two columns.
          <div className="mt-3 columns-2 gap-3 sm:columns-3 lg:columns-4">
            {recent.map((p) => {
              const url = thumbnailUrl(p.id, p.thumbnail);
              return (
                <Link
                  key={p.id}
                  href={`/edit?projectId=${encodeURIComponent(p.id)}&projectName=${encodeURIComponent(p.name)}`}
                  className="group mb-3 flex break-inside-avoid flex-col gap-1.5"
                >
                  <div
                    style={{ aspectRatio: `${p.width} / ${p.height}` }}
                    className="relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] transition group-hover:border-white/25"
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/15">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="M9 9.5v5l4.5-2.5L9 9.5Z" fill="currentColor" stroke="none" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <p className="truncate text-xs text-white/85">{p.name}</p>
                  <p className="text-[11px] text-white/35">{formatUpdatedAt(p.updatedAt)}</p>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <NewProjectDialog
          onClose={() => setShowCreate(false)}
          onCreated={(project: Project) => {
            router.push(`/edit?projectId=${encodeURIComponent(project.bpProjectId)}&projectName=${encodeURIComponent(project.name)}`);
          }}
        />
      )}
    </main>
  );
}
