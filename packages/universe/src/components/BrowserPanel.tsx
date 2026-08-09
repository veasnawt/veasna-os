import React, { useEffect, useRef, useState } from "react";
import { isElectronDesktop, WebviewElement } from "../utils/runtime";

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

/** YouTube's regular watch/share pages (`/watch?v=`, `youtu.be/...`) send the same anti-framing
 *  headers as everything else on the site and refuse to embed — but the dedicated `/embed/<id>`
 *  player is specifically designed to be framed elsewhere and explicitly allows it. Rewriting a
 *  watch/share URL to its embed equivalent is the one case here where the "this site blocks
 *  embedding" problem actually has a real fix, rather than just a fallback to "open in a real tab". */
function toEmbeddableUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  const host = parsed.hostname.replace(/^(www|m)\./, "");
  if (host === "youtube.com" && parsed.pathname === "/watch") {
    const videoId = parsed.searchParams.get("v");
    if (!videoId) return rawUrl;
    const embed = new URL(`https://www.youtube.com/embed/${videoId}`);
    const start = parsed.searchParams.get("t");
    if (start) embed.searchParams.set("start", start.replace(/s$/, ""));
    return embed.toString();
  }
  if (host === "youtu.be" && parsed.pathname.length > 1) {
    return `https://www.youtube.com/embed${parsed.pathname}`;
  }
  return rawUrl;
}

/** Turns address-bar text into a real URL — a bare domain gets `https://` prepended, anything else
 *  (no dot, or contains spaces) is treated as a search query rather than a broken navigation attempt.
 *  Search goes to Marginalia, not Google/Bing/DuckDuckGo/Yahoo/Yandex/etc — confirmed empirically
 *  (loaded each candidate in a real iframe and checked what rendered) that every mainstream engine
 *  refuses to be framed and shows a blank/broken page here; Marginalia is the one independent engine
 *  found that actually allows it. Its index is smaller/more niche than Google's, so results will be
 *  thinner — that's the real tradeoff of embedding search inside an iframe at all, not a bug.
 *  General site-blocks-embedding cases (Google's own pages, YouTube's non-video pages, most of the
 *  rest of the web) have no fix from this side — the remote server's own anti-clickjacking headers
 *  are enforced by the browser itself, before any of this app's code ever runs. The "↗ open in a
 *  real tab" button is the actual answer for those, not something client-side code can route around. */
function resolveAddress(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return toEmbeddableUrl(trimmed);
  const firstSegment = trimmed.split(/[\s/]/)[0];
  const looksLikeDomain = !trimmed.includes(" ") && /\.[a-z]{2,}$/i.test(firstSegment);
  if (looksLikeDomain) return toEmbeddableUrl(`https://${trimmed}`);
  return `https://search.marginalia.nu/search?query=${encodeURIComponent(trimmed)}`;
}

// Confirmed empirically (loaded each in a real iframe here and checked what rendered) — not a
// guess, and deliberately NOT extended to sites that merely seem likely to also block it, since an
// unconfirmed claim here would be worse than no warning at all. This list is specifically about
// <iframe> framing restrictions — an Electron <webview> is a real separate Chromium guest process,
// not bound by the *hosting page's* frame-ancestors the way an iframe is, so this banner is skipped
// entirely in desktop-app mode (see isKnownBlocked's caller below) rather than assumed to still apply.
const KNOWN_BLOCKED_HOSTS = new Set([
  "google.com", "www.google.com",
  "bing.com", "www.bing.com",
  "duckduckgo.com",
  "yahoo.com", "search.yahoo.com",
  "yandex.com",
  "youtube.com", "www.youtube.com", "m.youtube.com",
]);

function isKnownBlocked(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (!KNOWN_BLOCKED_HOSTS.has(parsed.hostname)) return false;
    // The one exception: YouTube's dedicated /embed/<id> player (what toEmbeddableUrl above rewrites
    // watch/share links to) is specifically designed to be framed and does NOT send the blocking
    // header the rest of the site does — it must not get flagged here just for sharing a hostname.
    if (parsed.hostname.endsWith("youtube.com") && parsed.pathname.startsWith("/embed/")) return false;
    return true;
  } catch {
    return false;
  }
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
  // Computed once — the app never switches runtimes mid-session, so this doesn't need to be reactive.
  const [desktopMode] = useState(isElectronDesktop);
  const webviewRef = useRef<WebviewElement | null>(null);
  const didMountRef = useRef(false);

  useEffect(() => {
    setDraft(url);
    setLoading(true);
  }, [url, reloadTick]);

  // React's own `src={url}` JSX attribute diffing already re-navigates the webview whenever `url`
  // changes (identical to how the iframe below is driven) — the only case that needs an imperative
  // nudge is a reload with the SAME url (the reload button, or Home when already on the default
  // page), where a same-value attribute write is a no-op and nothing would otherwise happen.
  useEffect(() => {
    if (!desktopMode) return;
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const webview = webviewRef.current;
    if (webview && webview.src === url) webview.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed only on reloadTick
  }, [reloadTick]);

  // did-navigate fires for both address-bar navigation AND the user clicking a link *inside* the
  // embedded page — the latter is new capability a <webview> unlocks over a cross-origin iframe
  // (which never told the parent anything about in-page navigation). Routing it through the same
  // onNavigate callback keeps VeasnaShell's external history array as the single source of truth,
  // matching how back/forward already work for the iframe path — no separate history model needed.
  useEffect(() => {
    if (!desktopMode) return;
    const webview = webviewRef.current;
    if (!webview) return;

    const handleStartLoading = () => setLoading(true);
    const handleStopLoading = () => setLoading(false);
    const handleNavigate = (e: Event) => {
      const navUrl = (e as unknown as { url?: string }).url;
      if (navUrl && navUrl !== url) onNavigate(navUrl);
    };

    webview.addEventListener("did-start-loading", handleStartLoading);
    webview.addEventListener("did-stop-loading", handleStopLoading);
    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigate);
    return () => {
      webview.removeEventListener("did-start-loading", handleStartLoading);
      webview.removeEventListener("did-stop-loading", handleStopLoading);
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigate);
    };
  }, [desktopMode, url, onNavigate]);

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

      {!desktopMode && isKnownBlocked(url) && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-950/60 px-3 py-1.5 text-[11px] text-amber-200">
          <span>This site blocks being embedded anywhere, on any site — it won't load here no matter what. Not a bug, just how it protects itself.</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full bg-amber-500/20 px-2.5 py-1 font-semibold text-amber-100 transition hover:bg-amber-500/30"
          >
            Open in real tab ↗
          </a>
        </div>
      )}

      {desktopMode ? (
        <webview ref={webviewRef} src={url} className="min-h-0 w-full flex-1 bg-white" />
      ) : (
        <iframe
          key={`${url}:${reloadTick}`}
          src={url}
          title="Browser"
          className="min-h-0 w-full flex-1 border-0 bg-white"
          onLoad={() => setLoading(false)}
          // `no-referrer` used to be set here, but YouTube's embed player specifically validates the
          // requesting origin via the Referer header and rejects requests that have none ("Error 153 —
          // video player configuration error") — confirmed by testing this exact change. This is the
          // browser's own actual default policy: sends the origin on cross-origin requests, not the
          // full path, so still meaningfully more private than the unrestricted legacy default.
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}

      <div className="shrink-0 border-t border-white/10 px-3 py-1 text-center text-[10px] text-slate-500">
        {desktopMode
          ? "Running in the Veasna OS desktop app — most sites load normally here, even ones blocked in the web version."
          : "Some sites block being embedded here — use ↗ to open them in a real browser tab instead."}
      </div>
    </div>
  );
}
