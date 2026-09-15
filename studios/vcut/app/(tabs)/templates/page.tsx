"use client";

import { useEffect, useState } from "react";
import { Avatar } from "../../_shared/Avatar";
import { authFetch, displayNameOrFallback, templatePosterUrl, templatePreviewUrl, type TemplateRow } from "../../_shared/hostedClient";
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
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    setTemplates(null);
    setError(null);
    const url = mode === "mine" ? "/api/vcut/templates" : "/api/vcut/templates/discover";
    authFetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Couldn't load templates (${res.status}).`);
        }
        const body = (await res.json()) as { templates: TemplateRow[] };
        setTemplates(body.templates);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't load templates."));
  }, [mode]);

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

      {error && <p className="mt-4 text-xs text-rose-300">{error}</p>}

      {templates === null ? (
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
