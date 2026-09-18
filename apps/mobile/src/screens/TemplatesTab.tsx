import { useEffect, useState } from "react";
import { listDiscoverTemplates, templatePosterUrl, templatePreviewUrl, type TemplateRow } from "@veasnawt/vcut/src/api/templates";
import { useSupabaseSession } from "@veasnawt/auth";
import { MobileSignInDialog } from "@veasnawt/vcut/src/ui/MobileSignInDialog";

/** Mobile's Templates tab — Discover only (everyone else's published templates; see
 *  `packages/vcut/src/api/templates.ts`'s own doc comment on why "My Templates" has no save path from a
 *  native project). Tapping a tile hands its id up to `App.tsx`, which mounts the shared
 *  `TemplateDraftApp` (the SAME fill-screen flow `studios/vcut/app/edit/page.tsx` already uses for
 *  "Use this template" on web/desktop) — no separate fill/preview UI built here, `loadTemplateForDraft`/
 *  `createProjectFromTemplate` already grew native branches for exactly this. */
export function TemplatesTab({ onUseTemplate }: { onUseTemplate: (templateId: string) => void }) {
  const { user } = useSupabaseSession();
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);

  useEffect(() => {
    if (!user) return;
    setTemplates(null);
    setError(null);
    listDiscoverTemplates()
      .then(setTemplates)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't load templates."));
  }, [user]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-lg font-semibold text-white">Templates</h1>

      {user === undefined ? (
        <p className="mt-6 text-xs text-white/40">Loading…</p>
      ) : !user ? (
        <div className="mt-6 max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-medium text-white">Sign in to browse Templates</p>
          <p className="mt-1.5 text-xs leading-relaxed text-white/50">Templates are shared through your VCut account — sign in to browse Discover.</p>
          <button onClick={() => setShowSignIn(true)} className="btn-brand-gradient mt-4 rounded-md px-3.5 py-2 text-xs font-semibold text-white">
            Sign in
          </button>
        </div>
      ) : (
        <>
          {error && <p className="mt-4 text-xs text-amber-200/80">{error}</p>}
          {!error && templates === null ? (
            <p className="mt-6 text-xs text-white/40">Loading…</p>
          ) : templates && templates.length === 0 ? (
            <p className="mt-6 text-xs text-white/40">Nothing published yet — check back later.</p>
          ) : (
            <div className="mt-6 columns-2 gap-3">
              {templates?.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => onUseTemplate(tpl.id)}
                  className="group mb-3 block w-full break-inside-avoid overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] text-left"
                >
                  <div className="relative aspect-[9/16] w-full bg-black">
                    <video
                      src={templatePreviewUrl(tpl.id)}
                      poster={templatePosterUrl(tpl.id)}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                    {tpl.likeCount !== undefined && (
                      <span className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white/80">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 21s-7.5-4.6-10-9.3C.4 8.2 2.3 4.8 5.7 4.3c2-.3 3.9.6 5 2.2a5.5 5.5 0 0 1 5-2.2c3.4.5 5.3 3.9 3.7 7.4C19.5 16.4 12 21 12 21Z" />
                        </svg>
                        {tpl.likeCount}
                      </span>
                    )}
                  </div>
                  <p className="truncate px-2 py-1.5 text-xs text-white/80">{tpl.name}</p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {showSignIn && <MobileSignInDialog onClose={() => setShowSignIn(false)} />}
    </main>
  );
}
