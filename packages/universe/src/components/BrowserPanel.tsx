import React, { useEffect, useRef, useState } from "react";
import { isElectronDesktop, WebviewElement } from "../utils/runtime";
import { Bookmark, addBookmark, isBookmarked, loadBookmarks, removeBookmark } from "../utils/bookmarks";
import { ACCENTS, BrowserAccent, BrowserThemeMode, BrowserThemeState, browserThemeVars, loadBrowserTheme, saveBrowserTheme } from "../utils/browserTheme";
import InstallAppDialog from "./InstallAppDialog";

export interface BrowserTab {
  id: string;
  history: string[];
  historyIndex: number;
  reloadTick: number;
}

interface BrowserPanelProps {
  tabs: BrowserTab[];
  activeTabId: string;
  onNavigate: (tabId: string, url: string) => void;
  onBack: (tabId: string) => void;
  onForward: (tabId: string) => void;
  onReload: (tabId: string) => void;
  onHome: (tabId: string) => void;
  onInstallApp: (name: string, url: string) => void;
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

/** Short label for a tab strip pill — just the hostname (minus "www."), since fetching a real page
 *  title would need either the desktop `<webview>`'s own (Electron-only) `getTitle()` API or
 *  reading into cross-origin iframe content, which the browser flatly refuses to allow. Hostname is
 *  the one thing derivable client-side in both runtimes, with no special-casing between them. */
export function tabLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "New Tab";
  } catch {
    return "New Tab";
  }
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
  active,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition hover:bg-[var(--browser-hover)] hover:text-[var(--browser-text)] disabled:opacity-30 disabled:hover:bg-transparent ${
      active ? "bg-[var(--browser-accent-soft)] text-[var(--browser-accent)]" : "text-[var(--browser-text-muted)]"
    }`}
  >
    {children}
  </button>
);

/** One tab's actual page content — a real per-tab <webview>/<iframe>, always mounted while its tab
 *  exists (not just the active one) and hidden via CSS rather than unmounted, so switching tabs
 *  preserves scroll position, form state, in-page JS state, etc. instead of reloading every time —
 *  the difference between "real tabs" and just swapping a single iframe's src back and forth. */
function BrowserTabContent({
  tab,
  visible,
  desktopMode,
  onNavigate,
  onLoadingChange,
  registerWebview,
}: {
  tab: BrowserTab;
  visible: boolean;
  desktopMode: boolean;
  onNavigate: (url: string) => void;
  onLoadingChange: (loading: boolean) => void;
  registerWebview: (el: WebviewElement | null) => void;
}) {
  const webviewRef = useRef<WebviewElement | null>(null);
  const didMountRef = useRef(false);
  const url = tab.history[tab.historyIndex];

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
    if (!webview || webview.src !== url) return;
    try {
      // Throws rather than no-ops if the guest's dom-ready hasn't fired yet (e.g. reloading a
      // brand new tab within its first instant) — not a real error, the reload is simply moot
      // since there's nothing loaded yet to reload.
      webview.reload();
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed only on reloadTick
  }, [tab.reloadTick]);

  // did-navigate fires for both address-bar navigation AND the user clicking a link *inside* the
  // embedded page — the latter is new capability a <webview> unlocks over a cross-origin iframe
  // (which never told the parent anything about in-page navigation). Routing it through the same
  // onNavigate callback keeps VeasnaShell's external history array as the single source of truth,
  // matching how back/forward already work for the iframe path — no separate history model needed.
  useEffect(() => {
    if (!desktopMode) return;
    const webview = webviewRef.current;
    if (!webview) return;

    const handleStartLoading = () => onLoadingChange(true);
    const handleStopLoading = () => onLoadingChange(false);
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
  }, [desktopMode, url, onNavigate, onLoadingChange]);

  // A blank new tab renders as a plain themed div instead of an actual <webview>/<iframe> pointed
  // at "about:blank" — a real about:blank DOCUMENT has its own opaque white background per the
  // HTML spec (an <iframe>'s host CSS background can't show through it), and Electron's <webview>
  // guest compositor is unreliable the same way, so setting a background-color on the host element
  // doesn't dependably work for either runtime. Skipping the real element entirely sidesteps both
  // platforms' quirks completely rather than fighting them.
  if (url === "about:blank") {
    return <div className={`h-full w-full bg-[var(--browser-bg)] ${visible ? "" : "hidden"}`} />;
  }

  return (
    <div className={`h-full w-full ${visible ? "" : "hidden"}`}>
      {desktopMode ? (
        <webview
          ref={(el) => {
            webviewRef.current = el as WebviewElement | null;
            registerWebview(el as WebviewElement | null);
          }}
          src={url}
          className="h-full w-full bg-white"
        />
      ) : (
        <iframe
          key={`${url}:${tab.reloadTick}`}
          src={url}
          title="Browser"
          className="h-full w-full border-0 bg-white"
          onLoad={() => onLoadingChange(false)}
          // `no-referrer` used to be set here, but YouTube's embed player specifically validates the
          // requesting origin via the Referer header and rejects requests that have none ("Error 153 —
          // video player configuration error") — confirmed by testing this exact change. This is the
          // browser's own actual default policy: sends the origin on cross-origin requests, not the
          // full path, so still meaningfully more private than the unrestricted legacy default.
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
    </div>
  );
}

export default function BrowserPanel({
  tabs,
  activeTabId,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onHome,
  onInstallApp,
}: BrowserPanelProps) {
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const url = activeTab.history[activeTab.historyIndex];
  const canGoBack = activeTab.historyIndex > 0;
  const canGoForward = activeTab.historyIndex < activeTab.history.length - 1;

  const [draft, setDraft] = useState(url);
  const [loadingByTab, setLoadingByTab] = useState<Record<string, boolean>>({});
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  // Computed once — the app never switches runtimes mid-session, so this doesn't need to be reactive.
  const [desktopMode] = useState(isElectronDesktop);
  const webviewsRef = useRef<Map<string, WebviewElement>>(new Map());
  const addressInputRef = useRef<HTMLInputElement>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadBookmarks());
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [browserTheme, setBrowserTheme] = useState<BrowserThemeState>(() => loadBrowserTheme());
  const [showThemePicker, setShowThemePicker] = useState(false);

  useEffect(() => {
    saveBrowserTheme(browserTheme);
  }, [browserTheme]);

  useEffect(() => {
    // A blank new tab shows an empty address bar (just the placeholder), not literal "about:blank"
    // text — matches how a real browser's omnibox looks on its New Tab Page.
    setDraft(url === "about:blank" ? "" : url);
  }, [url]);

  // Autofocus the address bar on a blank tab — covers both "+" (a brand new tab starts blank) and
  // switching to an existing blank one, matching a real browser jumping straight to the omnibox on
  // its New Tab Page rather than leaving you nowhere to type.
  useEffect(() => {
    if (url === "about:blank") addressInputRef.current?.focus();
  }, [activeTabId, url]);

  // DevTools is a per-webview toggle with no change event to listen for — re-synced defensively
  // whenever the active tab changes, since each tab's devtools state is independent. Wrapped in a
  // try/catch: right when a tab first becomes active (e.g. the very first tab, on mount) its
  // <webview>'s guest content hasn't necessarily finished attaching yet, and Electron's webview
  // API throws rather than returning a default when called too early — not a real error condition,
  // just means "not opened" is the correct answer either way.
  useEffect(() => {
    let opened = false;
    try {
      opened = webviewsRef.current.get(activeTabId)?.isDevToolsOpened() ?? false;
    } catch {
      opened = false;
    }
    setDevToolsOpen(opened);
  }, [activeTabId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const target = resolveAddress(draft);
    if (target && target !== url) onNavigate(activeTabId, target);
    else if (target === url) onReload(activeTabId);
  }

  function toggleDevTools() {
    const webview = webviewsRef.current.get(activeTabId);
    if (!webview) return;
    let opened = false;
    try {
      opened = webview.isDevToolsOpened();
    } catch {
      // Guest content not attached yet — treat as "not open", same as the sync effect above.
    }
    try {
      if (opened) {
        webview.closeDevTools();
        setDevToolsOpen(false);
      } else {
        webview.openDevTools();
        setDevToolsOpen(true);
      }
    } catch {
      // Guest content not attached yet — nothing to toggle.
    }
  }

  function toggleBookmark() {
    const existing = bookmarks.find((b) => b.url === url);
    setBookmarks(existing ? removeBookmark(existing.id) : addBookmark(tabLabel(url), url));
  }

  const loading = loadingByTab[activeTabId] ?? false;
  const bookmarked = isBookmarked(url, bookmarks);

  return (
    <div className="flex h-full w-full flex-col bg-[var(--browser-bg)]" style={browserThemeVars(browserTheme)}>
      {/* Tab strip lives in the title bar now (Chrome-style — see WindowChrome's titleBarLeft prop
          and Window.tsx's browser case), not as a separate row here. */}
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--browser-border)] px-2 py-1.5">
        <NavButton onClick={() => onBack(activeTabId)} disabled={!canGoBack} title="Back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavButton>
        <NavButton onClick={() => onForward(activeTabId)} disabled={!canGoForward} title="Forward">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavButton>
        <NavButton onClick={() => onReload(activeTabId)} title="Reload">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" />
            <path d="M21 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavButton>
        <NavButton onClick={() => onHome(activeTabId)} title="Home">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 11l9-8 9 8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 10v10h14V10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavButton>

        <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 items-center">
          <input
            ref={addressInputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="Search or enter address"
            className="w-full rounded-full border border-[var(--browser-border)] bg-[var(--browser-input-bg)] px-3 py-1 text-[12px] text-[var(--browser-text)] outline-none placeholder:text-[var(--browser-text-muted)] focus:border-[var(--browser-accent-border)]"
          />
        </form>

        <NavButton onClick={toggleBookmark} title={bookmarked ? "Remove bookmark" : "Bookmark this page"} active={bookmarked}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavButton>

        <div className="relative">
          <NavButton onClick={() => setShowBookmarks((v) => !v)} title="Bookmarks" active={showBookmarks}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
            </svg>
          </NavButton>
          {showBookmarks && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowBookmarks(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-[var(--browser-border)] bg-[var(--browser-surface)] py-1 shadow-xl">
                {bookmarks.length === 0 ? (
                  <div className="px-3 py-3 text-center text-[11px] text-[var(--browser-text-muted)]">No bookmarks yet — click the star to save this page.</div>
                ) : (
                  bookmarks.map((b) => (
                    <div key={b.id} className="group flex items-center gap-1.5 px-2 py-1.5 hover:bg-[var(--browser-hover)]">
                      <button
                        onClick={() => {
                          onNavigate(activeTabId, b.url);
                          setShowBookmarks(false);
                        }}
                        className="min-w-0 flex-1 truncate text-left text-[12px] text-[var(--browser-text)]"
                        title={b.url}
                      >
                        {b.name}
                      </button>
                      <button
                        onClick={() => setBookmarks(removeBookmark(b.id))}
                        title="Remove bookmark"
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--browser-text-muted)] opacity-0 transition hover:bg-[var(--browser-hover)] hover:text-[var(--browser-text)] group-hover:opacity-100"
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <NavButton onClick={() => setShowInstallDialog(true)} title="Install this site as an app">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 11v6M9 14l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavButton>

        <NavButton
          onClick={toggleDevTools}
          disabled={!desktopMode}
          title={desktopMode ? "Inspect (DevTools)" : "Inspect needs the desktop app — a cross-origin iframe's content can't be inspected from here, that's the browser's own security boundary"}
          active={devToolsOpen}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4h16v16H4z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 9h16M9 9v11" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavButton>

        <div className="relative">
          <NavButton onClick={() => setShowThemePicker((v) => !v)} title="Browser theme" active={showThemePicker}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                d="M12 21a9 9 0 1 1 0-18c4.97 0 9 3.5 9 7.5 0 2.49-2.01 3.5-4 3.5h-2.1a1.9 1.9 0 0 0-1.06 3.48A1.9 1.9 0 0 1 12.84 21H12z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="7.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="12" cy="7" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="16.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
            </svg>
          </NavButton>
          {showThemePicker && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowThemePicker(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-[var(--browser-border)] bg-[var(--browser-surface)] p-2.5 shadow-xl">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--browser-text-muted)]">Appearance</div>
                <div className="mb-2.5 flex gap-1.5">
                  {(["dark", "light"] as BrowserThemeMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setBrowserTheme((prev) => ({ ...prev, mode }))}
                      className={`flex-1 rounded-md py-1 text-[11px] font-medium capitalize transition ${
                        browserTheme.mode === mode
                          ? "bg-[var(--browser-accent-soft)] text-[var(--browser-accent)]"
                          : "text-[var(--browser-text-muted)] hover:bg-[var(--browser-hover)]"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--browser-text-muted)]">Accent</div>
                <div className="flex gap-1.5">
                  {(Object.keys(ACCENTS) as BrowserAccent[]).map((accent) => (
                    <button
                      key={accent}
                      onClick={() => setBrowserTheme((prev) => ({ ...prev, accent }))}
                      title={ACCENTS[accent].label}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition"
                      style={{
                        backgroundColor: ACCENTS[accent].hex,
                        outline: browserTheme.accent === accent ? `2px solid ${ACCENTS[accent].hex}` : "none",
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in new browser tab"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--browser-text-muted)] transition hover:bg-[var(--browser-hover)] hover:text-[var(--browser-text)]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15 3h6v6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      <div className="h-0.5 shrink-0 overflow-hidden bg-transparent">
        {loading && <div className="h-full w-1/3 animate-pulse bg-[var(--browser-accent)]" />}
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

      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <BrowserTabContent
            key={tab.id}
            tab={tab}
            visible={tab.id === activeTabId}
            desktopMode={desktopMode}
            onNavigate={(u) => onNavigate(tab.id, u)}
            onLoadingChange={(l) => setLoadingByTab((prev) => ({ ...prev, [tab.id]: l }))}
            registerWebview={(el) => {
              if (el) webviewsRef.current.set(tab.id, el);
              else webviewsRef.current.delete(tab.id);
            }}
          />
        ))}
      </div>

      <div className="shrink-0 border-t border-[var(--browser-border)] px-3 py-1 text-center text-[10px] text-[var(--browser-text-muted)]">
        {desktopMode
          ? "Running in the Veasna OS desktop app — most sites load normally here, even ones blocked in the web version."
          : "Some sites block being embedded here — use ↗ to open them in a real browser tab instead."}
      </div>

      {showInstallDialog && (
        <InstallAppDialog
          initialName={tabLabel(url)}
          initialUrl={url}
          onInstall={onInstallApp}
          onClose={() => setShowInstallDialog(false)}
        />
      )}
    </div>
  );
}
