"use client";

import { useEffect, useState } from "react";
import { authFetch, templatePreviewUrl, type TemplateRow } from "../../_shared/hostedClient";
import { TemplateViewer } from "../../_shared/TemplateViewer";

/** The "Templates" tab — a Pinterest-style masonry grid of every template you've saved (`saveAsTemplate`,
 *  triggered from inside the editor), one tile per template showing its own preview clip
 *  (`renderTemplatePreview`'s server-side output — see that function's own doc comment) as a static
 *  poster frame (no `autoplay`, just the video element's own default first-frame render — cheap, no
 *  separate thumbnail image needed). Tapping a tile opens the full-screen, swipe-to-next AUTOPLAY
 *  viewer (`TemplateViewer.tsx`) at that template's position in the list — same "Pinterest grid,
 *  TikTok/Reels full-screen" split asked for directly.
 *
 *  Phase 1 scope, deliberately: templates here are still 100% private (only you can see your own —
 *  no publishing/sharing exists yet), so the viewer's own action rail is "Use this template" / Delete /
 *  a personal (local-only) Bookmark — Like/Comment/Share need another person to interact with, which is
 *  Phase 2/3's public-sharing layer, not this one. */
export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    authFetch("/api/vcut/templates")
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Couldn't load your templates (${res.status}).`);
        }
        const body = (await res.json()) as { templates: TemplateRow[] };
        setTemplates(body.templates);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't load your templates."));
  }, []);

  function removeLocally(id: string) {
    setTemplates((prev) => prev?.filter((t) => t.id !== id) ?? null);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <h1 className="text-lg font-semibold text-white">Templates</h1>
      <p className="mt-1 text-xs text-white/40">Saved from inside the editor (Save as Template) — Pro only.</p>

      {error && <p className="mt-4 text-xs text-rose-300">{error}</p>}

      {templates === null ? (
        <p className="mt-6 text-xs text-white/40">Loading…</p>
      ) : templates.length === 0 ? (
        <p className="mt-6 text-xs text-white/40">
          Nothing saved yet — open a project, then use its own "Save as Template" action to add one here.
        </p>
      ) : (
        <div className="mt-6 columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5">
          {templates.map((tpl, index) => (
            <TemplateGridTile key={tpl.id} template={tpl} onOpen={() => setOpenIndex(index)} />
          ))}
        </div>
      )}

      {openIndex !== null && templates && (
        <TemplateViewer
          templates={templates}
          startIndex={openIndex}
          onClose={() => setOpenIndex(null)}
          onDeleted={(id) => removeLocally(id)}
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
function TemplateGridTile({ template, onOpen }: { template: TemplateRow; onOpen: () => void }) {
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
      </div>
      <p className="truncate px-2 py-1.5 text-xs text-white/80">{template.name}</p>
    </button>
  );
}
