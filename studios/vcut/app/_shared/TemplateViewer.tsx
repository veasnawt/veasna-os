"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "@veasnawt/vcut/src/ui/ConfirmDialog";
import { authFetch, templatePreviewUrl, type TemplateRow } from "./hostedClient";

const FAVORITES_STORAGE_KEY = "vcut-favorite-templates";

function readFavorites(): Set<string> {
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeFavorites(ids: Set<string>): void {
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // A private window or a full per-origin quota — the toggle still works for the rest of this
    // session, it just won't survive a reload. Not worth surfacing as an error for a purely personal,
    // non-social convenience feature (see this component's own doc comment on why it's local-only).
  }
}

/** The full-screen, swipe-to-next, autoplaying template viewer — TikTok/Reels-shaped (one template
 *  per screen-height section, vertical scroll-snap, a right-side action rail), opened from
 *  `templates/page.tsx`'s own Pinterest grid at whichever tile was tapped.
 *
 *  Native CSS scroll-snap (`snap-y snap-mandatory` + each section `snap-start snap-always`) drives the
 *  swipe/scroll gesture itself — real momentum scrolling, no hand-rolled touch math. An
 *  `IntersectionObserver` watches every section and plays whichever one is actually on screen, pausing
 *  the rest — the same "only ever one video actually decoding/playing at a time" discipline any real
 *  short-video feed needs, not just a nice-to-have.
 *
 *  Every video starts MUTED — autoplay-with-sound only survives a browser's own autoplay policy on the
 *  very FIRST video (opened by a genuine click), not on subsequent ones reached by scrolling (not a
 *  fresh user gesture, by most browsers' own definition) — so starting muted and offering one explicit
 *  unmute tap (applied to whichever section is current, persisted for the rest of THIS viewing
 *  session) is the only approach that behaves consistently across every video, not just the first.
 *
 *  Phase 1 scope: the action rail is "Use this template" (primary — starts a new project from it, the
 *  exact same `templateId` flow `ProjectsDashboard.tsx`'s own New Project dialog already uses), Delete,
 *  and a personal, LOCAL-ONLY (`localStorage`, not synced anywhere) Bookmark toggle — Like/Comment/Share
 *  need another person on the other end to mean anything, which needs Phase 2/3's public-sharing layer
 *  first (see this whole feature's own scoping discussion). Rename is deferred too — no update endpoint
 *  exists yet for a saved template's name; `templates/route.ts` only has create/list/delete today. */
export function TemplateViewer({
  templates,
  startIndex,
  onClose,
  onDeleted,
}: {
  templates: TemplateRow[];
  startIndex: number;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(templates[startIndex]?.id ?? null);
  const [muted, setMuted] = useState(true);
  const [favorites, setFavorites] = useState<Set<string>>(() => readFavorites());
  const [pendingDelete, setPendingDelete] = useState<TemplateRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);

  // Jump to the tapped tile's own section instantly (no animated scroll) — this is "open at this
  // one," not "scroll the user there."
  useEffect(() => {
    const container = containerRef.current;
    const target = templates[startIndex] && sectionRefs.current.get(templates[startIndex].id);
    if (container && target) container.scrollTop = target.offsetTop;
    // Deliberately once-on-mount only — startIndex never changes for the lifetime of one viewer instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (mostVisible) setActiveId(mostVisible.target.getAttribute("data-template-id"));
      },
      { root: container, threshold: [0.5, 0.75, 1] }
    );
    for (const el of sectionRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [templates]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeFavorites(next);
      return next;
    });
  }

  async function useTemplate(template: TemplateRow) {
    if (creating) return;
    setCreating(true);
    try {
      const res = await authFetch("/api/vcut/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: template.name, templateId: template.id }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { project: { bpProjectId: string; name: string } };
      router.push(`/edit?projectId=${encodeURIComponent(body.project.bpProjectId)}&projectName=${encodeURIComponent(body.project.name)}`);
    } catch {
      setCreating(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/vcut/templates?id=${encodeURIComponent(pendingDelete.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onDeleted(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black">
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      </button>

      <button
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        {muted ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 9v6h4l5 5V4L8 9H4Zm14.5 3-2.5 2.5m0-5 2.5 2.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 9v6h4l5 5V4L8 9H4Z" />
            <path d="M16.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
          </svg>
        )}
      </button>

      <div ref={containerRef} className="h-full w-full snap-y snap-mandatory overflow-y-auto scroll-smooth">
        {templates.map((template) => (
          <TemplateSection
            key={template.id}
            ref={(el) => {
              if (el) sectionRefs.current.set(template.id, el);
              else sectionRefs.current.delete(template.id);
            }}
            template={template}
            active={activeId === template.id}
            muted={muted}
            favorited={favorites.has(template.id)}
            creating={creating}
            onUseTemplate={() => void useTemplate(template)}
            onToggleFavorite={() => toggleFavorite(template.id)}
            onDelete={() => setPendingDelete(template)}
          />
        ))}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete template?"
          message={`"${pendingDelete.name}" will be permanently deleted. This can't be undone.`}
          confirmLabel={deleting ? "Deleting…" : "Delete"}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>,
    document.body
  );
}

interface TemplateSectionProps {
  template: TemplateRow;
  active: boolean;
  muted: boolean;
  favorited: boolean;
  creating: boolean;
  onUseTemplate: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}

function TemplateSection({
  ref,
  template,
  active,
  muted,
  favorited,
  creating,
  onUseTemplate,
  onToggleFavorite,
  onDelete,
}: TemplateSectionProps & { ref: (el: HTMLDivElement | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) void video.play().catch(() => {});
    else video.pause();
  }, [active]);

  return (
    <div ref={ref} data-template-id={template.id} className="relative flex h-full w-full snap-start snap-always items-center justify-center">
      <video ref={videoRef} src={templatePreviewUrl(template.id)} muted={muted} loop playsInline className="h-full w-full object-contain" />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-6 pt-16">
        <p className="text-sm font-medium text-white">{template.name}</p>
      </div>

      <div
        className="absolute right-3 flex flex-col items-center gap-5"
        style={{ bottom: "calc(6rem + env(safe-area-inset-bottom))" }}
      >
        <button onClick={onToggleFavorite} aria-label="Bookmark" className="flex flex-col items-center gap-1 text-white">
          <span className={`flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm ${favorited ? "text-amber-400" : ""}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill={favorited ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
              <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
            </svg>
          </span>
        </button>

        <button onClick={onDelete} aria-label="Delete template" className="flex flex-col items-center gap-1 text-white">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
            </svg>
          </span>
        </button>
      </div>

      <button
        onClick={onUseTemplate}
        disabled={creating}
        className="btn-brand-gradient absolute rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition disabled:cursor-default disabled:opacity-60"
        style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        {creating ? "One moment…" : "Use this template"}
      </button>
    </div>
  );
}
