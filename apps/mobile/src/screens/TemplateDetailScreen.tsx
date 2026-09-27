import { useEffect, useState } from "react";
import { Share } from "@capacitor/share";
import { centralAuthFetch, templateFullPreviewUrl, templatePosterUrl, templatePreviewUrl } from "@veasnawt/vcut/src/api/dashboardClient";

type TemplateInfo = { name: string; creatorDisplayName: string | null; aiCredits?: number };

export function TemplateDetailScreen({ templateId, onBack, onUse }: {
  templateId: string; onBack: () => void; onUse: () => void;
}) {
  const [info, setInfo] = useState<TemplateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [fallback, setFallback] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setError(null);
    void centralAuthFetch(`/api/vcut/templates/${encodeURIComponent(templateId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Couldn't load this template.");
        const data = await res.json() as TemplateInfo;
        if (active) setInfo(data);
      })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Couldn't load this template."); });
    return () => { active = false; };
  }, [templateId, retry]);
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0a0c10] text-white">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <button onClick={onBack} aria-label="Back" className="rounded-lg p-2 hover:bg-white/10">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m14 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{info?.name ?? "Template preview"}</span>
        <button aria-label="Share template" className="rounded-lg p-2 hover:bg-white/10" onClick={() => void Share.share({ title: info?.name ?? "VCut template", url: `https://vcut.io/t/${encodeURIComponent(templateId)}` }).catch(() => {})}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 16V3m-4 4 4-4 4 4M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </header>
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
        <video key={fallback ? "short" : "full"} src={fallback ? templatePreviewUrl(templateId) : templateFullPreviewUrl(templateId)}
          poster={templatePosterUrl(templateId)} controls autoPlay loop playsInline preload="auto"
          className="h-full w-full max-w-lg object-contain"
          onError={() => { if (!fallback) setFallback(true); else setVideoFailed(true); }} />
        {videoFailed && <p role="alert" className="absolute inset-x-4 top-4 rounded-lg bg-black/80 p-3 text-center text-sm text-amber-200">Couldn't play this preview. <button className="underline" onClick={() => { setVideoFailed(false); setFallback(false); }}>Retry</button></p>}
      </div>
      <footer className="shrink-0 border-t border-white/10 p-4">
        <h1 className="truncate text-base font-semibold">{info?.name ?? "Template preview"}</h1>
        {info?.creatorDisplayName && <p className="mt-1 text-xs text-white/50">By {info.creatorDisplayName}</p>}
        {error && <p role="alert" className="mt-2 text-xs text-amber-200">{error} <button className="underline" onClick={() => setRetry((n) => n + 1)}>Retry</button></p>}
        <button disabled={!info || !!error} onClick={onUse} className="mt-4 w-full rounded-xl bg-gradient-to-r from-sky-400 to-violet-500 px-4 py-3 text-sm font-semibold disabled:opacity-40">Use this template</button>
        {!!info?.aiCredits && <p className="mt-2 text-center text-xs text-white/45">Uses {info.aiCredits} AI credits</p>}
      </footer>
    </div>
  );
}
