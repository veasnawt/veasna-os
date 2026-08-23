"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "@veasna/vstudio/src/ui/ConfirmDialog";
import { RESOLUTION_PRESETS, type Asset, type Project } from "@veasna/vstudio/src/project/types";

interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  clipCount: number;
  width: number;
  height: number;
  thumbnail?: { relPath: string; kind: "thumbnail" | "media" };
}

function thumbnailUrl(projectId: string, thumbnail: ProjectSummary["thumbnail"]): string | undefined {
  if (!thumbnail) return undefined;
  return `/api/vstudio/media/raw?projectId=${encodeURIComponent(projectId)}&relPath=${encodeURIComponent(thumbnail.relPath)}&kind=${thumbnail.kind}`;
}

function formatUpdatedAt(ms: number): string {
  const diffMinutes = Math.round((Date.now() - ms) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(ms).toLocaleDateString();
}

/** One preset's little aspect-ratio swatch — a literal Tailwind class per shape (not a computed
 *  `aspect-[${w}/${h}]` string) because the JIT compiler only picks up classes it can see written out
 *  verbatim in the source; a template literal built from `preset.width`/`height` at runtime would
 *  silently render unstyled. */
function presetAspectClass(label: string): string {
  if (label.startsWith("Vertical")) return "aspect-[9/16]";
  if (label.startsWith("Landscape")) return "aspect-[16/9]";
  return "aspect-square";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The "start a new project" flow — a modal rather than the old inline row of controls squeezed above
 *  the project list, because a name, an orientation choice, and an optional file all need real room to
 *  read as one coherent decision instead of a cramped afterthought. Same overlay/portal convention as
 *  `ConfirmDialog` (see that file's own comment for why a portal specifically). */
function NewProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (project: Project) => void }) {
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<(typeof RESOLUTION_PRESETS)[number]>(RESOLUTION_PRESETS[0]);
  const [media, setMedia] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !creating) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [creating, onClose]);

  function pickMedia(file: File | undefined | null) {
    if (file) setMedia(file);
  }

  async function submit() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/vstudio/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, width: preset.width, height: preset.height, fps: 30 }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { project: Project };
      let project = body.project;

      // A starting file was picked — reuse the editor's own import route (real ffprobe server-side,
      // same as any in-editor import) so the project ends up sized to the media's real dimensions
      // instead of whatever preset was showing when the file was picked.
      if (media) {
        const form = new FormData();
        form.append("file", media);
        const importRes = await fetch(`/api/vstudio/media?projectId=${encodeURIComponent(project.bpProjectId)}`, {
          method: "POST",
          body: form,
        });
        if (!importRes.ok) throw new Error();
        const { asset } = (await importRes.json()) as { asset: Asset };

        project = {
          ...project,
          assets: [...project.assets, asset],
          sequence: {
            ...project.sequence,
            width: asset.width ?? project.sequence.width,
            height: asset.height ?? project.sequence.height,
            fps: asset.fps ?? project.sequence.fps,
          },
          exportSettings: {
            ...project.exportSettings,
            width: asset.width ?? project.exportSettings.width,
            height: asset.height ?? project.exportSettings.height,
            fps: asset.fps ?? project.exportSettings.fps,
          },
        };

        const saveRes = await fetch(`/api/vstudio/project?projectId=${encodeURIComponent(project.bpProjectId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project }),
        });
        if (!saveRes.ok) throw new Error();
      }

      onCreated(project);
    } catch {
      setError("Couldn't create the project. Try again.");
      setCreating(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => !creating && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="New project"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-white/10 bg-[#12151c] p-6 shadow-2xl"
      >
        <h2 className="text-base font-semibold text-white">New project</h2>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/40">Name</span>
          <input
            ref={nameInputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !creating) void submit();
            }}
            placeholder="Untitled project"
            className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-sky-400"
          />
        </label>

        <div className="mt-5">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/40">Resolution</span>
          <div className={`grid grid-cols-3 gap-2 transition ${media ? "pointer-events-none opacity-40" : ""}`}>
            {RESOLUTION_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setPreset(p)}
                aria-pressed={!media && preset.label === p.label}
                className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition ${
                  !media && preset.label === p.label
                    ? "border-sky-400 bg-sky-500/10"
                    : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
                }`}
              >
                <div className={`flex h-10 items-center justify-center ${presetAspectClass(p.label)}`}>
                  <div
                    className={`h-full rounded-[3px] border-2 ${
                      !media && preset.label === p.label ? "border-sky-400" : "border-white/30"
                    }`}
                    style={{ aspectRatio: `${p.width} / ${p.height}` }}
                  />
                </div>
                <span className="text-center text-[11px] leading-tight text-white/70">
                  {p.label.split(" ")[0]}
                  <br />
                  <span className="text-white/40">
                    {p.width}×{p.height}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/40">
            Starting media <span className="normal-case text-white/25">(optional — sets resolution automatically)</span>
          </span>

          {media ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs text-white/80">{media.name}</p>
                <p className="text-[11px] text-white/40">{formatFileSize(media.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMedia(null);
                  if (mediaInputRef.current) mediaInputRef.current.value = "";
                }}
                aria-label="Remove starting media"
                className="shrink-0 rounded p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>
          ) : (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                pickMedia(e.dataTransfer.files?.[0]);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-4 text-center transition ${
                dragActive ? "border-sky-400 bg-sky-500/5" : "border-white/15 hover:border-white/30 hover:bg-white/[0.03]"
              }`}
            >
              <span className="text-xs text-white/50">Drop a video, image, or audio file — or click to browse</span>
              <input
                ref={mediaInputRef}
                type="file"
                accept="video/*,image/*,audio/*"
                className="hidden"
                onChange={(e) => pickMedia(e.target.files?.[0])}
              />
            </label>
          )}
        </div>

        {error && <p className="mt-4 text-xs text-rose-300">{error}</p>}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={creating}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={creating}
            className="rounded-md bg-sky-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create project"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** VStudio's own home — a real entry point now that it's a standalone app, not just something BP
 *  Studio's Create page hands a `projectId` to. Lists every project on disk (`/api/vstudio/projects`)
 *  and lets a new one be started (`POST /api/vstudio/project`, via `NewProjectDialog`) without any host
 *  app involved. A host app embedding VStudio (BP Studio, today) still skips straight to
 *  `/edit?projectId=...` directly — this page is for when VStudio is opened on its own. */
export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

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

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-4 py-8 sm:gap-8 sm:px-6 sm:py-12">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white">VStudio</h1>
          <p className="mt-1 text-xs text-white/40">A focused video editor for short-form creative work.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-sky-500 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-sky-400"
        >
          <span aria-hidden className="text-base leading-none">
            +
          </span>
          New Project
        </button>
      </header>

      {error && <p className="text-xs text-rose-300">{error}</p>}

      {projects !== null && projects.length > 0 && (
        <div className="relative max-w-sm">
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

      <section>
        {projects === null ? (
          <p className="text-xs text-white/40">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-xs text-white/40">No projects yet — create one above.</p>
        ) : filtered && filtered.length === 0 ? (
          <p className="text-xs text-white/40">No projects match &ldquo;{search}&rdquo;.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered?.map((p) => {
              const portrait = p.height > p.width;
              const url = thumbnailUrl(p.id, p.thumbnail);
              return (
                <div key={p.id} className="group flex flex-col gap-2">
                  <Link
                    href={`/edit?projectId=${encodeURIComponent(p.id)}&projectName=${encodeURIComponent(p.name)}`}
                    className="relative block aspect-video overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] transition group-hover:border-white/25"
                  >
                    {url ? (
                      // A local file served from this app's own API, not something next/image's
                      // remote-optimization pipeline has any reason to sit in front of.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/15">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="M9 9.5v5l4.5-2.5L9 9.5Z" fill="currentColor" stroke="none" />
                        </svg>
                      </div>
                    )}

                    <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/70 backdrop-blur-sm">
                      {portrait ? "⬍" : "⬌"} {p.width}×{p.height}
                    </span>

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setPendingDelete(p);
                      }}
                      aria-label={`Delete ${p.name}`}
                      title="Delete project"
                      className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1.5 text-white/70 opacity-0 backdrop-blur-sm transition hover:bg-rose-500/80 hover:text-white group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
                      </svg>
                    </button>
                  </Link>

                  <Link
                    href={`/edit?projectId=${encodeURIComponent(p.id)}&projectName=${encodeURIComponent(p.name)}`}
                    className="min-w-0 px-0.5"
                  >
                    <p className="truncate text-sm text-white/85">{p.name}</p>
                    <p className="text-xs text-white/35">
                      {p.clipCount} clip{p.clipCount === 1 ? "" : "s"} · {formatUpdatedAt(p.updatedAt)}
                    </p>
                  </Link>
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
          onCreated={(project) => {
            router.push(`/edit?projectId=${encodeURIComponent(project.bpProjectId)}&projectName=${encodeURIComponent(project.name)}`);
          }}
        />
      )}
    </main>
  );
}
