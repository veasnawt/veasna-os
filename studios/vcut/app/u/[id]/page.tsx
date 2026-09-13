"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSupabaseSession } from "@veasnawt/auth";
import { Avatar } from "../../_shared/Avatar";
import { authFetch, displayNameOrFallback, templatePreviewUrl, type TemplateRow } from "../../_shared/hostedClient";

interface CreatorInfo {
  id: string;
  displayName: string | null;
  followerCount: number;
  followingCount: number;
  totalLikes: number;
  viewerIsFollowing: boolean;
  templates: TemplateRow[];
  likedTemplates: TemplateRow[];
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** A creator profile page (Phase 3) — display name, Follower/Following/Likes counts, a real Follow
 *  button, and two grids: what they've published and what they've liked. Outside `(tabs)` (no tab bar,
 *  no sign-in gate) — genuinely public, same as `/t/[id]`; a signed-out visitor sees everything except
 *  the Follow button itself (tapping it sends them to `/login` instead, same pattern `/t/[id]`'s own
 *  like/comment prompts already use). Tapping a template tile opens its own `/t/[id]` share page rather
 *  than the in-app full-screen viewer, since an anonymous visitor has no viewer to open. */
export default function CreatorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSupabaseSession();
  const [info, setInfo] = useState<CreatorInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<"templates" | "liked">("templates");
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    authFetch(`/api/vcut/creators/${encodeURIComponent(params.id)}`)
      .then(async (res) => {
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        setInfo((await res.json()) as CreatorInfo);
      })
      .catch(() => setNotFound(true));
  }, [params.id]);

  async function toggleFollow() {
    if (!info || followBusy) return;
    if (!user) {
      router.push("/login");
      return;
    }
    setFollowBusy(true);
    const nextFollowing = !info.viewerIsFollowing;
    setInfo({ ...info, viewerIsFollowing: nextFollowing, followerCount: info.followerCount + (nextFollowing ? 1 : -1) });
    try {
      const res = await authFetch(`/api/vcut/creators/${encodeURIComponent(info.id)}/follow`, {
        method: nextFollowing ? "POST" : "DELETE",
      });
      if (!res.ok) throw new Error();
    } catch {
      // Roll back the optimistic update — a real, reported bug otherwise: a failed write (the server
      // down, a schema-cache miss, a network hiccup) still LOOKED like it worked until the next reload
      // showed the true, unchanged state.
      setInfo((prev) => (prev ? { ...prev, viewerIsFollowing: !nextFollowing, followerCount: prev.followerCount - (nextFollowing ? 1 : -1) } : prev));
    } finally {
      setFollowBusy(false);
    }
  }

  function share() {
    const url = `${window.location.origin}/u/${encodeURIComponent(params.id)}`;
    if (navigator.share) {
      navigator.share({ title: info ? displayNameOrFallback(info.displayName) : "A VCut creator", url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).catch(() => {});
    }
  }

  if (notFound) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-[#0a0c10] px-4 text-center text-white">
        <p className="text-sm text-white/60">This creator doesn't exist.</p>
        <a href="/" className="mt-4 text-xs text-sky-300 underline">
          Go to VCut
        </a>
      </main>
    );
  }

  const shown = info ? (tab === "templates" ? info.templates : info.likedTemplates) : [];

  return (
    <main className="mx-auto max-w-md px-4 py-6 text-white sm:py-10">
      <button onClick={() => router.back()} aria-label="Back" className="text-white/70">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 19 8 12l7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {info === null ? (
        <p className="mt-6 text-xs text-white/40">Loading…</p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-4">
            <Avatar seed={info.id} displayName={info.displayName} size={72} />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">{displayNameOrFallback(info.displayName)}</h1>
              <p className="mt-0.5 text-xs text-white/40">ID: {info.id.slice(0, 8).toUpperCase()}</p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-6">
            <div className="text-center">
              <p className="text-base font-semibold">{formatCount(info.followingCount)}</p>
              <p className="text-[11px] text-white/50">Following</p>
            </div>
            <div className="text-center">
              <p className="text-base font-semibold">{formatCount(info.followerCount)}</p>
              <p className="text-[11px] text-white/50">Followers</p>
            </div>
            <div className="text-center">
              <p className="text-base font-semibold">{formatCount(info.totalLikes)}</p>
              <p className="text-[11px] text-white/50">Likes</p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => void toggleFollow()}
              disabled={followBusy}
              className={`flex-1 rounded-md py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                info.viewerIsFollowing ? "border border-white/15 bg-white/[0.03] text-white" : "btn-brand-gradient text-white"
              }`}
            >
              {info.viewerIsFollowing ? "Following" : "Follow"}
            </button>
            <button
              onClick={share}
              aria-label="Share this profile"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/[0.03] text-white"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="18" cy="5" r="2.5" />
                <circle cx="6" cy="12" r="2.5" />
                <circle cx="18" cy="19" r="2.5" />
                <path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6" />
              </svg>
            </button>
          </div>

          <div className="mt-6 flex border-b border-white/10">
            {(["templates", "liked"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 border-b-2 pb-2.5 text-sm font-medium transition ${
                  tab === t ? "border-white text-white" : "border-transparent text-white/40"
                }`}
              >
                {t === "templates" ? "Templates" : "Liked content"}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="mt-6 text-xs text-white/40">
              {tab === "templates" ? "No published templates yet." : "Nothing liked yet."}
            </p>
          ) : (
            <div className="mt-4 columns-2 gap-3">
              {shown.map((tpl) => (
                <a
                  key={tpl.id}
                  href={`/t/${encodeURIComponent(tpl.id)}`}
                  className="group mb-3 block w-full break-inside-avoid overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]"
                >
                  <div className="aspect-[9/16] w-full bg-black">
                    <video src={templatePreviewUrl(tpl.id)} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  </div>
                  <p className="truncate px-2 py-1.5 text-xs text-white/80">{tpl.name}</p>
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
