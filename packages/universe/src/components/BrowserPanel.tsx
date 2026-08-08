import React, { useEffect, useState } from "react";

interface BrowserPanelProps {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  reloadTick: number;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
}

/** Turns address-bar text into a real URL — a bare domain gets `https://` prepended, anything else
 *  (no dot, or contains spaces) is treated as a search query rather than a broken navigation attempt.
 *  Search goes to Marginalia, not Google/Bing/DuckDuckGo/Yahoo/Yandex/etc — confirmed empirically
 *  (loaded each candidate in a real iframe and checked what rendered) that every mainstream engine
 *  refuses to be framed and shows a blank/broken page here; Marginalia is the one independent engine
 *  found that actually allows it. Its index is smaller/more niche than Google's, so results will be
 *  thinner — that's the real tradeoff of embedding search inside an iframe at all, not a bug. */
function resolveAddress(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const firstSegment = trimmed.split(/[\s/]/)[0];
  const looksLikeDomain = !trimmed.includes(" ") && /\.[a-z]{2,}$/i.test(firstSegment);
  if (looksLikeDomain) return `https://${trimmed}`;
  return `https://search.marginalia.nu/search?query=${encodeURIComponent(trimmed)}`;
}

const NavButton = ({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
  >
    {children}
  </button>
);

export default function BrowserPanel({
  url,
  canGoBack,
  canGoForward,
  reloadTick,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onHome,
}: BrowserPanelProps) {
  const [draft, setDraft] = useState(url);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setDraft(url);
    setLoading(true);
  }, [url, reloadTick]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const target = resolveAddress(draft);
    if (target && target !== url) onNavigate(target);
    else if (target === url) onReload();
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#0b0e14]">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/10 px-2 py-1.5">
        <NavButton onClick={onBack} disabled={!canGoBack} title="Back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavButton>
        <NavButton onClick={onForward} disabled={!canGoForward} title="Forward">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavButton>
        <NavButton onClick={onReload} title="Reload">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" />
            <path d="M21 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavButton>
        <NavButton onClick={onHome} title="Home">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 11l9-8 9 8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 10v10h14V10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavButton>

        <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 items-center">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="Search or enter address"
            className="w-full rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-sky-400/50"
          />
        </form>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in new browser tab"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15 3h6v6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      <div className="h-0.5 shrink-0 overflow-hidden bg-transparent">
        {loading && <div className="h-full w-1/3 animate-pulse bg-sky-400" />}
      </div>

      <iframe
        key={`${url}:${reloadTick}`}
        src={url}
        title="Browser"
        className="min-h-0 w-full flex-1 border-0 bg-white"
        onLoad={() => setLoading(false)}
        referrerPolicy="no-referrer"
      />

      <div className="shrink-0 border-t border-white/10 px-3 py-1 text-center text-[10px] text-slate-500">
        Some sites block being embedded here — use ↗ to open them in a real browser tab instead.
      </div>
    </div>
  );
}
