"use client";

import { useEffect, useState } from "react";
import { authFetch, templatePreviewUrl, type TemplateRow } from "../../_shared/hostedClient";
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
  const [mode, setMode] = useState<FeedMode>("mine");
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

/** One grid tile — a `<video>` shows its own natural first frame as a poster (no `autoplay`, no
 *  separate thumbnail image needed). `hasPreview` tracks load success purely to swap in the generic
 *  placeholder icon on failure (an older template with no rendered preview, or a best-effort render
 *  that failed — see `renderTemplatePreview`'s own doc comment) — plain React state instead of a CSS
 *  sibling-selector trick, which would need to match an inline `style` attribute's exact string form
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
      </div>
      <p className="truncate px-2 py-1.5 text-xs text-white/80">{template.name}</p>
    </button>
  );
}
