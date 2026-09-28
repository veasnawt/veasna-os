"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSupabaseBrowserClient, useSupabaseSession } from "@veasnawt/auth";
import { Avatar } from "../../_shared/Avatar";
import { TemplateCommentList } from "@veasnawt/vcut/src/ui/TemplateCommentList";
import {
  authFetch,
  displayNameOrFallback,
  templateFullPreviewUrl,
  templatePosterUrl,
  templatePreviewUrl,
  type CommentRow,
} from "../../_shared/hostedClient";

interface TemplateInfo {
  id: string;
  name: string;
  isPublic: boolean;
  ownerId: string;
  creatorDisplayName: string | null;
  likeCount: number;
  commentCount: number;
  viewerHasLiked: boolean;
  aiCredits?: number;
}

/** Phase 3's public share page — the destination behind a shared template link, reachable by anyone,
 *  signed in or not (its own scoping decision: "a public preview page, no sign-in required"). Outside
 *  the `(tabs)` route group entirely (see that layout's own doc comment) — this has no tab bar, and
 *  deliberately doesn't run its sign-in gate: `GET /api/vcut/templates/[id]` and its own `/comments`
 *  route both use `publicSessionRoute`, which tolerates a signed-out visitor rather than redirecting
 *  one to `/login` the way every `(tabs)` page does.
 *
 *  A private template (or one that never existed) 404s exactly like an in-app fetch would — this page
 *  doesn't distinguish "wrong id" from "not public" for the same information-hiding reason
 *  `getViewableTemplate` already collapses both into one 403 server-side.
 *
 *  Liking and commenting still need a real account (no anonymous mutation, even here) — a signed-out
 *  visitor sees a "Sign in to like or comment" prompt in place of the input, linking to `/login`
 *  (which always lands on `/projects` post-sign-in today — there's no return-to-this-page redirect
 *  yet, matching every other sign-in entry point in this app). */
export default function PublicTemplatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSupabaseSession();
  const [info, setInfo] = useState<TemplateInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [commentsFailed, setCommentsFailed] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentActionError, setCommentActionError] = useState<string | null>(null);
  const [replyToComment, setReplyToComment] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [liking, setLiking] = useState(false);
  const [creating, setCreating] = useState(false);
  // The real, full-length render — falls back to the short tile loop for a template saved before that
  // file existed, or whose background render hasn't finished yet (same fallback `TemplateViewer.tsx`'s
  // own `TemplateSection` uses, and for the same reason).
  const [videoSrc, setVideoSrc] = useState(() => templateFullPreviewUrl(params.id));
  const triedFallback = useRef(false);

  useEffect(() => {
    authFetch(`/api/vcut/templates/${encodeURIComponent(params.id)}`)
      .then(async (res) => {
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        setInfo((await res.json()) as TemplateInfo);
      })
      .catch(() => setNotFound(true));
    authFetch(`/api/vcut/templates/${encodeURIComponent(params.id)}/comments`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { comments: CommentRow[] } | null) => {
        if (body) setComments(body.comments);
        else setCommentsFailed(true);
      })
      .catch(() => setCommentsFailed(true));
  }, [params.id]);

  const refreshComments = useCallback(async () => {
    const response = await authFetch(`/api/vcut/templates/${encodeURIComponent(params.id)}/comments`);
    if (!response.ok) throw new Error("Could not load comments");
    const result = (await response.json()) as { comments: CommentRow[] };
    setComments(result.comments);
  }, [params.id]);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = client.channel(`vcut-share-comments-${params.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "template_comments", filter: `template_id=eq.${params.id}` }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void refreshComments().catch(() => setCommentsFailed(true)), 180);
      }).subscribe();
    return () => { if (timer) clearTimeout(timer); void client.removeChannel(channel); };
  }, [params.id, refreshComments]);

  async function startFromTemplate() {
    if (!info || creating) return;
    if (!user) {
      router.push("/login");
      return;
    }
    // Opens the template as an unsaved draft — no project is created until media is actually picked
    // for it (see `TemplateDraftApp`).
    setCreating(true);
    router.push(`/edit?templateId=${encodeURIComponent(info.id)}&projectName=${encodeURIComponent(info.name)}`);
  }

  async function toggleLike() {
    if (!info || liking) return;
    if (!user) {
      router.push("/login");
      return;
    }
    setLiking(true);
    const nextLiked = !info.viewerHasLiked;
    setInfo({ ...info, viewerHasLiked: nextLiked, likeCount: info.likeCount + (nextLiked ? 1 : -1) });
    try {
      const res = await authFetch(`/api/vcut/templates/${encodeURIComponent(info.id)}/like`, { method: nextLiked ? "POST" : "DELETE" });
      if (!res.ok) throw new Error("Could not post comment");
    } catch {
      // Roll back — same real bug the creator page's Follow button had: a failed write shouldn't go on
      // looking successful until the next reload.
      setInfo((prev) => (prev ? { ...prev, viewerHasLiked: !nextLiked, likeCount: prev.likeCount - (nextLiked ? 1 : -1) } : prev));
    } finally {
      setLiking(false);
    }
  }

  async function postComment() {
    const body = commentInput.trim();
    if (!body || posting || !info) return;
    if (!user) {
      router.push("/login");
      return;
    }
    setPosting(true);
    try {
      const res = await authFetch(`/api/vcut/templates/${encodeURIComponent(info.id)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentCommentId: replyToComment }),
      });
      if (!res.ok) throw new Error();
      const { comment } = (await res.json()) as { comment: CommentRow };
      setComments((prev) => [...(prev ?? []).filter((row) => row.id !== comment.id), comment]);
      setInfo((prev) => (prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev));
      setCommentInput("");
      setReplyToComment(null);
      setCommentActionError(null);
    } catch (cause) {
      setCommentActionError(cause instanceof Error ? cause.message : "Could not post comment");
      // Left in the input — the user can just retry the same text.
    } finally {
      setPosting(false);
    }
  }

  async function editComment(id: string, body: string) {
    const response = await authFetch(`/api/vcut/templates/${encodeURIComponent(params.id)}/comments/${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }),
    });
    if (!response.ok) throw new Error("Could not edit comment");
    await refreshComments();
  }

  async function deleteComment(id: string) {
    const response = await authFetch(`/api/vcut/templates/${encodeURIComponent(params.id)}/comments/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Could not delete comment");
    const { removedCount } = (await response.json()) as { removedCount: number };
    await refreshComments();
    setInfo((current) => current ? { ...current, commentCount: Math.max(0, current.commentCount - removedCount) } : current);
  }

  function share() {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: info?.name ?? "A VCut template", url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).catch(() => {});
    }
  }

  if (notFound) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-[#0a0c10] px-4 text-center text-white">
        <p className="text-sm text-white/60">This template isn&apos;t public, or doesn&apos;t exist.</p>
        <Link href="/" className="mt-4 text-xs text-sky-300 underline">
          Go to VCut
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-[#0a0c10] px-4 py-8 text-white sm:py-12">
      <div className="relative mx-auto aspect-[9/16] w-full max-w-sm overflow-hidden rounded-xl bg-black">
        <video
          src={videoSrc}
          poster={templatePosterUrl(params.id)}
          controls
          loop
          playsInline
          className="h-full w-full object-contain"
          onError={() => {
            if (triedFallback.current) return;
            triedFallback.current = true;
            setVideoSrc(templatePreviewUrl(params.id));
          }}
        />
      </div>

      {info && (
        <>
          <h1 className="mt-4 text-base font-semibold">{info.name}</h1>
          {info.aiCredits !== undefined && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-white/70">
              <span className="rounded-sm bg-amber-400 px-1 text-[9px] font-bold leading-[1.4] text-black">PRO</span>
              Uses AI effects · about {info.aiCredits} credits to use
            </p>
          )}

          <a href={`/u/${encodeURIComponent(info.ownerId)}`} className="mt-2 flex items-center gap-2">
            <Avatar seed={info.ownerId} displayName={info.creatorDisplayName} size={26} />
            <span className="text-xs text-white/60">{displayNameOrFallback(info.creatorDisplayName)}</span>
          </a>

          <div className="mt-4 flex items-center gap-4">
            <button onClick={() => void toggleLike()} className="flex items-center gap-1.5 text-xs text-white/70">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill={info.viewerHasLiked ? "#f43f5e" : "none"}
                stroke={info.viewerHasLiked ? "#f43f5e" : "currentColor"}
                strokeWidth="1.8"
              >
                <path d="M12 21s-7.5-4.6-10-9.3C.4 8.2 2.3 4.8 5.7 4.3c2-.3 3.9.6 5 2.2a5.5 5.5 0 0 1 5-2.2c3.4.5 5.3 3.9 3.7 7.4C19.5 16.4 12 21 12 21Z" />
              </svg>
              {info.likeCount}
            </button>
            <span className="flex items-center gap-1.5 text-xs text-white/70">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 11.5a8.4 8.4 0 0 1-8.7 8.4A9 9 0 0 1 8 19l-5 1 1.4-4.1A8.4 8.4 0 0 1 3 11.5 8.4 8.4 0 0 1 11.5 3 8.5 8.5 0 0 1 21 11.5Z" />
              </svg>
              {info.commentCount}
            </span>
            <button onClick={share} className="ml-auto flex items-center gap-1.5 text-xs text-white/70">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="18" cy="5" r="2.5" />
                <circle cx="6" cy="12" r="2.5" />
                <circle cx="18" cy="19" r="2.5" />
                <path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6" />
              </svg>
              Share
            </button>
          </div>

          <button
            onClick={() => void startFromTemplate()}
            disabled={creating}
            className="btn-brand-gradient mt-5 w-full rounded-md py-2.5 text-center text-sm font-semibold text-white disabled:cursor-default disabled:opacity-60"
          >
            {creating ? "One moment…" : "Use this template"}
          </button>

          <div className="mt-8 flex-1">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-white/40">Comments</p>
            {comments === null ? (
              commentsFailed ? (
                <p className="text-xs text-amber-200/80">Couldn&apos;t load comments — try again in a moment.</p>
              ) : (
                <p className="text-xs text-white/40">Loading…</p>
              )
            ) : comments.length === 0 ? (
              <p className="text-xs text-white/40">No comments yet.</p>
            ) : (
              <TemplateCommentList comments={comments} userId={user?.id ?? null} canModerate={info?.ownerId === user?.id}
                onReply={setReplyToComment} onEdit={editComment} onDelete={deleteComment} />
            )}

            {user ? (
              <div className="mt-4">
                {commentActionError && <p role="alert" className="mb-2 text-xs text-amber-200">{commentActionError}</p>}
                {replyToComment && <div className="mb-2 flex items-center justify-between text-[11px] text-sky-300"><span>Replying to comment</span><button onClick={() => setReplyToComment(null)} className="text-white/45">Cancel</button></div>}
                <div className="flex gap-2">
                <input
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter" && !posting) void postComment(); }}
                  placeholder={replyToComment ? "Write a reply…" : "Add a comment…"}
                  className="flex-1 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white placeholder:text-white/30"
                />
                <button
                  onClick={() => void postComment()}
                  disabled={posting || !commentInput.trim()}
                  className="rounded-md bg-white/10 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                >
                  Post
                </button>
                </div>
              </div>
            ) : (
              <a href={`/login?next=${encodeURIComponent(`/t/${params.id}`)}`} className="mt-4 block text-xs text-sky-300 underline">
                Sign in to like or comment
              </a>
            )}
          </div>
        </>
      )}
    </main>
  );
}
