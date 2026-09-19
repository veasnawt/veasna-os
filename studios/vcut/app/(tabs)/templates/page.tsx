"use client";

import { useEffect, useState } from "react";
import { startCheckout } from "@veasnawt/vcut/src/api/billing";
import { isDesktopSignInAvailable, openDesktopSignIn } from "@veasnawt/vcut/src/api/desktopAuth";
import { Avatar } from "../../_shared/Avatar";
import { centralAuthFetch, displayNameOrFallback, HOSTED, templatePosterUrl, templatePreviewUrl, type TemplateRow } from "../../_shared/hostedClient";
import { TemplateViewer } from "../../_shared/TemplateViewer";

type FeedMode = "mine" | "discover";

/** The "Templates" tab — a Pinterest-style masonry grid, one tile per template showing its own preview
 *  clip (`renderTemplatePreview`'s server-side output — see that function's own doc comment) as a
 *  static poster frame (no `autoplay`, just the video element's own default first-frame render — cheap,
 *  no separate thumbnail image needed). Tapping a tile opens the full-screen, swipe-to-next AUTOPLAY
 *  viewer (`TemplateViewer.tsx`) at that template's position in the list.
 *
 *  Two feeds, Phase 2's own split: "My Templates" (`GET /api/vcut/templates` — everything you've
 *  saved, private or published) and "Discover" (`GET /api/vcut/templates/discover` — everyone ELSE's
 *  published ones, Free-plan-browsable by design — see that route's own doc comment). A template's
 *  own public/private state and the Publish/Unpublish action only ever show in "My Templates" —
 *  Discover is read-only browsing of content that isn't yours. Still anonymous either way for now:
 *  there's no creator-profile system yet (Phase 3), so a Discover tile shows the template itself with
 *  no "by so-and-so" attribution. */
export default function TemplatesPage() {
  // Discover, not "My Templates" — a first-time visitor has saved nothing yet (an empty state that
  // demonstrates nothing), while Discover always has real content once anything's published, matching
  // the TikTok/Reels-style default this whole feature is modeled on.
  const [mode, setMode] = useState<FeedMode>("discover");
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "My Templates" is Pro-only server-side (`requirePro`), so a Free account's request always comes
  // back 402 `pro-required` — an expected answer, not a failure, and shown as an invitation rather
  // than an error line.
  const [needsPro, setNeedsPro] = useState(false);
  // Desktop's Templates tab has no sign-in redirect the way the hosted web one does (`(tabs)/layout.tsx`
  // only gates `HOSTED`) — a signed-out desktop request comes back a plain 401 here instead, which used
  // to just render as inert error text with nothing to click. Tracked separately from `error` so this
  // can show a real "Sign in" button instead.
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTemplates(null);
    setError(null);
    setNeedsPro(false);
    setNeedsSignIn(false);
    const url = mode === "mine" ? "/api/vcut/templates" : "/api/vcut/templates/discover";
    centralAuthFetch(url)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) {
            if (!cancelled) setNeedsSignIn(true);
            return;
          }
          const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
          if (body?.code === "pro-required") {
            if (!cancelled) setNeedsPro(true);
            return;
          }
          throw new Error(body?.error ?? `Couldn't load templates (${res.status}).`);
        }
        const body = (await res.json()) as { templates: TemplateRow[] };
        if (!cancelled) setTemplates(body.templates);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load templates.");
      });
    // Switching tabs mid-request would otherwise let the slower, now-stale response land last.
    return () => {
      cancelled = true;
    };
  }, [mode]);

  async function upgrade() {
    setUpgrading(true);
    try {
      window.location.href = await startCheckout();
    } catch {
      setError("Couldn't start checkout — try again in a moment.");
      setUpgrading(false);
    }
  }

  function removeLocally(id: string) {
    setTemplates((prev) => prev?.filter((t) => t.id !== id) ?? null);
  }

  function setPublicLocally(id: string, isPublic: boolean) {
    setTemplates((prev) => prev?.map((t) => (t.id === id ? { ...t, isPublic } : t)) ?? null);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <h1 className="text-lg font-semibold text-white">Templates</h1>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setMode("mine")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            mode === "mine" ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80"
          }`}
        >
          My Templates
        </button>
        <button
          onClick={() => setMode("discover")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            mode === "discover" ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80"
          }`}
        >
          Discover
        </button>
      </div>

      {error && <p className="mt-4 text-xs text-amber-200/80">{error}</p>}

      {needsSignIn ? (
        <div className="mt-6 max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-medium text-white">Sign in to browse Templates</p>
          <p className="mt-1.5 text-xs leading-relaxed text-white/50">Templates are shared through your VCut account.</p>
          {HOSTED ? (
            <a
              href="/login"
              className="mt-4 inline-block rounded-md bg-sky-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-sky-400"
            >
              Sign in
            </a>
          ) : isDesktopSignInAvailable() ? (
            <button
              onClick={openDesktopSignIn}
              className="mt-4 rounded-md bg-sky-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-sky-400"
            >
              Sign in
            </button>
          ) : null}
        </div>
      ) : needsPro ? (
        <div className="mt-6 max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-medium text-white">Save your own templates with Pro</p>
          <p className="mt-1.5 text-xs leading-relaxed text-white/50">
            Turn any project into a reusable template and share it with other creators. Browsing and using templates in
            Discover is free.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => void upgrade()}
              disabled={upgrading}
              className="rounded-md bg-sky-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:opacity-60"
            >
              {upgrading ? "One moment…" : "Upgrade to Pro"}
            </button>
            <button
              onClick={() => setMode("discover")}
              className="rounded-md border border-white/15 px-3.5 py-2 text-xs font-medium text-white/80 transition hover:bg-white/5"
            >
              Browse Discover
            </button>
          </div>
        </div>
      ) : error ? null : templates === null ? (
        <p className="mt-6 text-xs text-white/40">Loading…</p>
      ) : templates.length === 0 ? (
        <p className="mt-6 text-xs text-white/40">
          {mode === "mine"
            ? 'Nothing saved yet — open a project, then use its own "Save as Template" action to add one here.'
            : "Nothing published yet — check back later, or be the first: publish one of your own from \"My Templates\"."}
        </p>
      ) : (
        <div className="mt-6 columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5">
          {templates.map((tpl, index) => (
            <TemplateGridTile key={tpl.id} template={tpl} showPublicBadge={mode === "mine"} onOpen={() => setOpenIndex(index)} />
          ))}
        </div>
      )}

      {openIndex !== null && templates && (
        <TemplateViewer
          templates={templates}
          startIndex={openIndex}
          mode={mode}
          onClose={() => setOpenIndex(null)}
          onDeleted={(id) => removeLocally(id)}
          onPublicChanged={(id, isPublic) => setPublicLocally(id, isPublic)}
        />
      )}
    </main>
  );
}

/** One grid tile — a `<video poster=...>` showing a real still frame (`templatePosterUrl`,
 *  `renderTemplatePreview`'s own `poster.jpg`) until/unless it actually plays, not the browser's own
 *  default first-frame decode an earlier version of this relied on: confirmed as a real, reported bug
 *  that several browsers (mobile Safari included, with `preload="metadata"` and no `autoplay`) never
 *  actually do, rendering the tile solid black. `hasPreview` tracks load success purely to swap in the
 *  generic placeholder icon on failure (an older template with no rendered preview, or a best-effort
 *  render that failed — see `renderTemplatePreview`'s own doc comment) — plain React state instead of a
 *  CSS sibling-selector trick, which would need to match an inline `style` attribute's exact string form
 *  and is exactly the kind of "looks clever, breaks silently" fragility not worth it here. */
function TemplateGridTile({
  template,
  showPublicBadge,
  onOpen,
}: {
  template: TemplateRow;
  showPublicBadge: boolean;
  onOpen: () => void;
}) {
  const [hasPreview, setHasPreview] = useState(true);
  return (
    <button
      onClick={onOpen}
      className="group mb-3 block w-full break-inside-avoid overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] text-left transition hover:border-white/25"
    >
      <div className="relative aspect-[9/16] w-full bg-black">
        {hasPreview ? (
          <video
            src={templatePreviewUrl(template.id)}
            poster={templatePosterUrl(template.id)}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
            onError={() => setHasPreview(false)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/10">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M9 9.5v5l4.5-2.5L9 9.5Z" fill="currentColor" stroke="none" />
            </svg>
          </div>
        )}
        {showPublicBadge && template.isPublic && (
          <span className="absolute left-1.5 top-1.5 rounded bg-sky-500/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
            Public
          </span>
        )}
        {template.likeCount !== undefined && (
          <span className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white/80">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21s-7.5-4.6-10-9.3C.4 8.2 2.3 4.8 5.7 4.3c2-.3 3.9.6 5 2.2a5.5 5.5 0 0 1 5-2.2c3.4.5 5.3 3.9 3.7 7.4C19.5 16.4 12 21 12 21Z" />
            </svg>
            {template.likeCount}
          </span>
        )}
      </div>
      <p className="truncate px-2 py-1.5 text-xs text-white/80">{template.name}</p>
      {template.creatorDisplayName !== undefined && (
        <div className="flex items-center gap-1 px-2 pb-1.5">
          <Avatar seed={template.ownerId} displayName={template.creatorDisplayName} size={14} />
          <span className="truncate text-[10px] text-white/40">{displayNameOrFallback(template.creatorDisplayName)}</span>
        </div>
      )}
    </button>
  );
}
