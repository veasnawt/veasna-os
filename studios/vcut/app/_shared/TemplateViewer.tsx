"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useSupabaseSession } from "@veasnawt/auth";
import { ConfirmDialog } from "@veasnawt/vcut/src/ui/ConfirmDialog";
import { Avatar } from "./Avatar";
import { authFetch, displayNameOrFallback, templatePreviewUrl, type CommentRow, type TemplateRow } from "./hostedClient";

const FAVORITES_STORAGE_KEY = "vcut-favorite-templates";
const MUTED_STORAGE_KEY = "vcut-template-viewer-muted";

/** Whether to start muted THIS time — `true` (silent) the very first time anyone opens this viewer in
 *  a browser, since starting unmuted on a video reached by scroll (not a fresh click) routinely gets
 *  silently blocked by the browser's own autoplay policy, which would read as "the sound button is
 *  broken" rather than "this browser said no." Every time after that, remembers whatever the person
 *  chose LAST time (the mute button below) — once they've explicitly unmuted once, defaulting back to
 *  silent on every subsequent visit is exactly the kind of "resets every time" friction real short-
 *  video apps don't have. */
function readInitialMuted(): boolean {
  try {
    const raw = window.localStorage.getItem(MUTED_STORAGE_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

function writeMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTED_STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // Same private-window/full-quota tolerance as `writeFavorites` — worst case this just falls back
    // to always starting muted next time, never a broken viewer.
  }
}

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

/** Phase 3's real social state for one template — creator identity, like/comment counts, and whether
 *  THIS viewer has liked it. Seeded from whatever `discover/route.ts` already batched into the list
 *  response (avoids an initial-load flash for the feed a viewer actually scrolls), then kept fresh via
 *  `GET /api/vcut/templates/[id]` — the single source of truth for a template's OWN counts, since
 *  `mode === "mine"` rows never carry these fields at all (`listTemplatesForOwner` doesn't batch them —
 *  "My Templates" never needed a creator-attribution feed the way Discover does), so this component
 *  fetches it there lazily instead, one id at a time, only for whichever section is actually active. */
interface SocialInfo {
  creatorDisplayName: string | null;
  likeCount: number;
  commentCount: number;
  viewerHasLiked: boolean;
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
 *  Starts MUTED the very first time anyone opens this viewer in a browser — autoplay-with-sound only
 *  survives a browser's own autoplay policy on the very FIRST video (opened by a genuine click), not on
 *  subsequent ones reached by scrolling (not a fresh user gesture, by most browsers' own definition), so
 *  starting unmuted by default would routinely get silently blocked. One explicit unmute tap applies to
 *  whichever section is current and is remembered (`localStorage`, `readInitialMuted`/`writeMuted`)
 *  across future visits — once someone's chosen sound on, defaulting back to silent every time they
 *  reopen this viewer would be exactly the "resets every time" friction real short-video apps avoid.
 *
 *  The action rail is "Use this template" (primary) plus: a personal, LOCAL-ONLY (`localStorage`, not
 *  synced anywhere) Bookmark toggle; a real, server-backed Like with a visible count (Phase 3 — the two
 *  coexist deliberately, "save for myself" and "publicly show appreciation" are different actions, the
 *  same way most real short-video apps keep both); a Comment button opening a bottom sheet
 *  (list + post, "basic" delete-your-own-or-your-template's moderation); and Share (Web Share API on
 *  mobile, clipboard fallback, linking to the new public `/t/[id]` page — reachable signed-out). Only
 *  `mode === "mine"` additionally shows Publish/Unpublish and Delete, and only `mode === "discover"`
 *  shows the creator's own name/avatar (a "My Templates" row is always yours — no attribution needed).
 *  Rename is still deferred — no update endpoint exists for a template's own NAME yet, only its
 *  public/private state. */
export function TemplateViewer({
  templates,
  startIndex,
  mode,
  onClose,
  onDeleted,
  onPublicChanged,
}: {
  templates: TemplateRow[];
  startIndex: number;
  mode: "mine" | "discover";
  onClose: () => void;
  onDeleted: (id: string) => void;
  onPublicChanged: (id: string, isPublic: boolean) => void;
}) {
  const router = useRouter();
  const { user } = useSupabaseSession();
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(templates[startIndex]?.id ?? null);
  const [muted, setMuted] = useState(() => readInitialMuted());
  const [favorites, setFavorites] = useState<Set<string>>(() => readFavorites());
  const [pendingDelete, setPendingDelete] = useState<TemplateRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [social, setSocial] = useState<Map<string, SocialInfo>>(() => {
    const seed = new Map<string, SocialInfo>();
    for (const t of templates) {
      if (t.likeCount !== undefined) {
        seed.set(t.id, {
          creatorDisplayName: t.creatorDisplayName ?? null,
          likeCount: t.likeCount,
          commentCount: t.commentCount ?? 0,
          viewerHasLiked: t.viewerHasLiked ?? false,
        });
      }
    }
    return seed;
  });
  const [commentsOpenFor, setCommentsOpenFor] = useState<string | null>(null);
  const [comments, setComments] = useState<Map<string, CommentRow[]>>(new Map());
  const [commentInput, setCommentInput] = useState("");
  const [postingComment, setPostingComment] = useState(false);

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

  // Keeps every section's own like/comment count and creator name fresh, one id at a time, only once
  // it's actually the active section — see this component's own top doc comment on why this can't just
  // rely on what `templates` was seeded with.
  useEffect(() => {
    if (!activeId || social.has(activeId)) return;
    authFetch(`/api/vcut/templates/${encodeURIComponent(activeId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          body: { creatorDisplayName: string | null; likeCount: number; commentCount: number; viewerHasLiked: boolean } | null
        ) => {
          if (!body) return;
          setSocial((prev) => new Map(prev).set(activeId, body));
        }
      )
      .catch(() => {});
    // Deliberately excludes `social` — re-running whenever the map itself changes (e.g. right after an
    // optimistic like update below) would immediately re-check `social.has(activeId)` against a map
    // that's already up to date, which is harmless but pointless; keying only off `activeId` means this
    // fetch runs exactly once per section actually visited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeFavorites(next);
      return next;
    });
  }

  async function toggleLike(id: string) {
    const current = social.get(id);
    const nextLiked = !current?.viewerHasLiked;
    setSocial((prev) => {
      const next = new Map(prev);
      next.set(id, {
        creatorDisplayName: current?.creatorDisplayName ?? null,
        commentCount: current?.commentCount ?? 0,
        likeCount: (current?.likeCount ?? 0) + (nextLiked ? 1 : -1),
        viewerHasLiked: nextLiked,
      });
      return next;
    });
    try {
      await authFetch(`/api/vcut/templates/${encodeURIComponent(id)}/like`, { method: nextLiked ? "POST" : "DELETE" });
    } catch {
      // Left optimistic on a network hiccup — same tolerance the Bookmark toggle already has for its
      // own (local-only) write; a stale count self-corrects the next time this section becomes active.
    }
  }

  function openComments(id: string) {
    setCommentsOpenFor(id);
    if (comments.has(id)) return;
    authFetch(`/api/vcut/templates/${encodeURIComponent(id)}/comments`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { comments: CommentRow[] } | null) => {
        if (body) setComments((prev) => new Map(prev).set(id, body.comments));
      })
      .catch(() => {});
  }

  async function postComment() {
    const templateId = commentsOpenFor;
    const body = commentInput.trim();
    if (!templateId || !body || postingComment) return;
    setPostingComment(true);
    try {
      const res = await authFetch(`/api/vcut/templates/${encodeURIComponent(templateId)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error();
      const { comment } = (await res.json()) as { comment: CommentRow };
      setComments((prev) => new Map(prev).set(templateId, [...(prev.get(templateId) ?? []), comment]));
      setSocial((prev) => {
        const current = prev.get(templateId);
        if (!current) return prev;
        return new Map(prev).set(templateId, { ...current, commentCount: current.commentCount + 1 });
      });
      setCommentInput("");
    } catch {
      // Left in the input for a retry — same "don't silently eat what they typed" posture the
      // template-name/comment inputs elsewhere in this app already take.
    } finally {
      setPostingComment(false);
    }
  }

  async function deleteComment(templateId: string, commentId: string) {
    setComments((prev) => new Map(prev).set(templateId, (prev.get(templateId) ?? []).filter((c) => c.id !== commentId)));
    setSocial((prev) => {
      const current = prev.get(templateId);
      if (!current) return prev;
      return new Map(prev).set(templateId, { ...current, commentCount: Math.max(0, current.commentCount - 1) });
    });
    try {
      await authFetch(`/api/vcut/templates/${encodeURIComponent(templateId)}/comments/${encodeURIComponent(commentId)}`, {
        method: "DELETE",
      });
    } catch {
      // Same accepted-optimistic-drift tolerance as `toggleLike` — a failed delete just reappears next
      // time this panel reloads (it isn't re-fetched proactively here).
    }
  }

  function share(template: TemplateRow) {
    const url = `${window.location.origin}/t/${encodeURIComponent(template.id)}`;
    if (navigator.share) {
      navigator.share({ title: template.name, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).catch(() => {});
    }
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

  async function togglePublic(template: TemplateRow) {
    if (publishingId) return;
    setPublishingId(template.id);
    try {
      const nextValue = !template.isPublic;
      const res = await authFetch(`/api/vcut/templates/${encodeURIComponent(template.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: nextValue }),
      });
      if (!res.ok) throw new Error();
      onPublicChanged(template.id, nextValue);
    } finally {
      setPublishingId(null);
    }
  }

  const commentsTemplate = commentsOpenFor ? templates.find((t) => t.id === commentsOpenFor) : undefined;

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
        onClick={() =>
          setMuted((m) => {
            writeMuted(!m);
            return !m;
          })
        }
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
            mode={mode}
            active={activeId === template.id}
            muted={muted}
            favorited={favorites.has(template.id)}
            social={social.get(template.id)}
            creating={creating}
            publishing={publishingId === template.id}
            onUseTemplate={() => void useTemplate(template)}
            onToggleFavorite={() => toggleFavorite(template.id)}
            onToggleLike={() => void toggleLike(template.id)}
            onOpenComments={() => openComments(template.id)}
            onShare={() => share(template)}
            onDelete={() => setPendingDelete(template)}
            onTogglePublic={() => void togglePublic(template)}
          />
        ))}
      </div>

      {commentsTemplate &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-end bg-black/60" onClick={() => setCommentsOpenFor(null)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[70vh] w-full flex-col rounded-t-2xl bg-[#14161b] pb-[env(safe-area-inset-bottom)]"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <p className="text-sm font-medium text-white">Comments</p>
                <button onClick={() => setCommentsOpenFor(null)} aria-label="Close comments" className="text-white/50">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3">
                {!comments.has(commentsTemplate.id) ? (
                  <p className="text-xs text-white/40">Loading…</p>
                ) : comments.get(commentsTemplate.id)!.length === 0 ? (
                  <p className="text-xs text-white/40">No comments yet — be the first.</p>
                ) : (
                  <ul className="space-y-3">
                    {comments.get(commentsTemplate.id)!.map((c) => {
                      const canDelete = c.userId === user?.id || mode === "mine";
                      return (
                        <li key={c.id} className="flex items-start gap-2">
                          <Avatar seed={c.userId} displayName={c.authorDisplayName} size={22} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-white/80">{displayNameOrFallback(c.authorDisplayName)}</p>
                            <p className="break-words text-xs text-white/60">{c.body}</p>
                          </div>
                          {canDelete && (
                            <button
                              onClick={() => void deleteComment(commentsTemplate.id, c.id)}
                              aria-label="Delete comment"
                              className="shrink-0 text-[10px] text-white/30 hover:text-rose-300"
                            >
                              Delete
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {user ? (
                <div className="flex gap-2 border-t border-white/10 p-3">
                  <input
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !postingComment) void postComment();
                    }}
                    placeholder="Add a comment…"
                    className="flex-1 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white placeholder:text-white/30"
                  />
                  <button
                    onClick={() => void postComment()}
                    disabled={postingComment || !commentInput.trim()}
                    className="rounded-md bg-white/10 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                  >
                    Post
                  </button>
                </div>
              ) : (
                <p className="border-t border-white/10 p-3 text-xs text-white/40">Sign in to comment.</p>
              )}
            </div>
          </div>,
          document.body
        )}

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
  mode: "mine" | "discover";
  active: boolean;
  muted: boolean;
  favorited: boolean;
  social: SocialInfo | undefined;
  creating: boolean;
  publishing: boolean;
  onUseTemplate: () => void;
  onToggleFavorite: () => void;
  onToggleLike: () => void;
  onOpenComments: () => void;
  onShare: () => void;
  onDelete: () => void;
  onTogglePublic: () => void;
}

function TemplateSection({
  ref,
  template,
  mode,
  active,
  muted,
  favorited,
  social,
  creating,
  publishing,
  onUseTemplate,
  onToggleFavorite,
  onToggleLike,
  onOpenComments,
  onShare,
  onDelete,
  onTogglePublic,
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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-20 pr-16 pt-16">
        {mode === "discover" && (
          <a
            href={`/u/${encodeURIComponent(template.ownerId)}`}
            className="pointer-events-auto mb-1 inline-block truncate text-xs text-white/70"
          >
            {displayNameOrFallback(social?.creatorDisplayName)}
          </a>
        )}
        <p className="truncate text-sm font-medium text-white">{template.name}</p>
      </div>

      <div
        className="absolute right-3 flex flex-col items-center gap-5"
        style={{ bottom: "calc(6rem + env(safe-area-inset-bottom))" }}
      >
        {mode === "discover" && (
          <a href={`/u/${encodeURIComponent(template.ownerId)}`} aria-label="Creator profile" className="flex flex-col items-center">
            <Avatar seed={template.ownerId} displayName={social?.creatorDisplayName} size={36} />
          </a>
        )}

        <button onClick={onToggleLike} aria-label="Like" className="flex flex-col items-center gap-1 text-white">
          <span className={`flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm ${social?.viewerHasLiked ? "text-rose-400" : ""}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill={social?.viewerHasLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
              <path d="M12 21s-7.5-4.6-10-9.3C.4 8.2 2.3 4.8 5.7 4.3c2-.3 3.9.6 5 2.2a5.5 5.5 0 0 1 5-2.2c3.4.5 5.3 3.9 3.7 7.4C19.5 16.4 12 21 12 21Z" />
            </svg>
          </span>
          {social !== undefined && <span className="text-[10px] text-white/70">{social.likeCount}</span>}
        </button>

        <button onClick={onOpenComments} aria-label="Comments" className="flex flex-col items-center gap-1 text-white">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21 11.5a8.4 8.4 0 0 1-8.7 8.4A9 9 0 0 1 8 19l-5 1 1.4-4.1A8.4 8.4 0 0 1 3 11.5 8.4 8.4 0 0 1 11.5 3 8.5 8.5 0 0 1 21 11.5Z" />
            </svg>
          </span>
          {social !== undefined && <span className="text-[10px] text-white/70">{social.commentCount}</span>}
        </button>

        <button onClick={onToggleFavorite} aria-label="Bookmark" className="flex flex-col items-center gap-1 text-white">
          <span className={`flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm ${favorited ? "text-amber-400" : ""}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill={favorited ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
              <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
            </svg>
          </span>
        </button>

        <button onClick={onShare} aria-label="Share" className="flex flex-col items-center gap-1 text-white">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="18" cy="5" r="2.5" />
              <circle cx="6" cy="12" r="2.5" />
              <circle cx="18" cy="19" r="2.5" />
              <path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6" />
            </svg>
          </span>
        </button>

        {mode === "mine" && (
          <>
            <button
              onClick={onTogglePublic}
              disabled={publishing}
              aria-label={template.isPublic ? "Unpublish template" : "Publish template"}
              title={template.isPublic ? "Public — visible in Discover" : "Private — only you can see this"}
              className="flex flex-col items-center gap-1 text-white disabled:opacity-50"
            >
              <span className={`flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm ${template.isPublic ? "text-sky-400" : ""}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
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
          </>
        )}
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
