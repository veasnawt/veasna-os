"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Avatar } from "../../_shared/Avatar";
import { authFetch, displayNameOrFallback, templatePreviewUrl, type TemplateRow } from "../../_shared/hostedClient";

interface CreatorInfo {
  id: string;
  displayName: string | null;
  templates: TemplateRow[];
}

/** A minimal creator profile page (Phase 3) — a grid of one creator's own PUBLISHED templates, reached
 *  by tapping their name in Discover, the viewer's action rail, or the public `/t/[id]` share page.
 *  Outside `(tabs)` (no tab bar, no sign-in gate) — genuinely public, same as `/t/[id]`. Deliberately
 *  read-only: no follow, no bio, no cover photo — Phase 3's own "minimal" scoping, not a cut corner.
 *  Tapping a tile here opens that template's own `/t/[id]` share page rather than the in-app full-
 *  screen viewer, since an anonymous visitor has no viewer to open. */
export default function CreatorPage() {
  const params = useParams<{ id: string }>();
  const [info, setInfo] = useState<CreatorInfo | null>(null);

  useEffect(() => {
    authFetch(`/api/vcut/creators/${encodeURIComponent(params.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: CreatorInfo | null) => setInfo(body))
      .catch(() => setInfo(null));
  }, [params.id]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 text-white sm:py-12">
      {info === null ? (
        <p className="text-xs text-white/40">Loading…</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Avatar seed={info.id} displayName={info.displayName} size={44} />
            <h1 className="text-lg font-semibold">{displayNameOrFallback(info.displayName)}</h1>
          </div>

          {info.templates.length === 0 ? (
            <p className="mt-6 text-xs text-white/40">No published templates yet.</p>
          ) : (
            <div className="mt-6 columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5">
              {info.templates.map((tpl) => (
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
