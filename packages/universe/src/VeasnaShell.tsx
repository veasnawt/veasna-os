"use client";

import React, { useEffect, useRef, useState } from "react";
import CosmosCanvas from "./CosmosCanvas";
import TraditionalShell, { STUDIO_ICONS, TraditionalShellHandle, DesktopEntrySummary } from "./components/TraditionalShell";
import Window from "./components/Window";
import { BrowserTab } from "./components/BrowserPanel";
import Taskbar from "./components/Taskbar";
import SearchOverlay from "./components/SearchOverlay";
import TaskManagerWindow from "./components/TaskManagerWindow";
import AboutOSWindow from "./components/AboutOSWindow";
import OSUpdateWindow from "./components/OSUpdateWindow";
import RixieWindow, { OsContext } from "./components/RixieWindow";
import RixieCompanion, { RixieCompanionState } from "./components/RixieCompanion";
import { CELESTIAL_BODIES } from "./constants";
import { CelestialBody, OpenWindow, PinnableId, ShellMode, StudioId, TaskbarAlignment, WindowRect } from "./types";
import { DEFAULT_WALLPAPER, WALLPAPER_PRESETS, isCustomWallpaper } from "./utils/wallpaperGenerator";
import { DEFAULT_THEME, THEME_PRESETS, ThemeMode } from "./utils/theme";
import { ViewerSummary } from "./utils/desktopItems";
import { isElectronDesktop } from "./utils/runtime";
import { loadBrowserSession, saveBrowserSession } from "./utils/browserSession";
import { ambientAudio } from "./utils/ambientAudio";

/** `crypto.randomUUID` is gated to secure contexts (HTTPS, or literally `localhost`) — a plain LAN
 *  IP over HTTP does NOT count. The `typeof crypto !== "undefined"` checks this file used to guard
 *  these calls with don't actually protect against that: `crypto` itself still exists in an insecure
 *  context, it's `crypto.randomUUID` specifically that's missing there, so every one of those calls
 *  still threw "crypto.randomUUID is not a function" (confirmed live — the same failure mode found
 *  and fixed in VStudio for the identical reason). `crypto.getRandomValues`, unlike `randomUUID`, is
 *  NOT restricted to secure contexts, so it's the real fallback here rather than `Math.random()`. */
function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

const TERMINAL_META_MARKER = "@@VEASNA_TERMINAL_META@@";
// Most major search engines (Google, Bing, DuckDuckGo) send X-Frame-Options/CSP headers that refuse
// iframe embedding entirely — confirmed empirically, not assumed — so Google as a default would be
// a blank/broken-page icon in the plain web version. It works fine as the default in the desktop
// app though, where the Browser studio renders through a real Electron <webview> (a genuine
// separate Chromium guest process) instead of an <iframe> — not bound by the *hosting page's*
// frame-ancestors restriction the way an iframe is. Wikipedia (which allows framing) stays the
// fallback default for the web version; the address bar still treats a search-looking query as a
// Google search either way (see `resolveAddress` in BrowserPanel.tsx).
function defaultBrowserUrl(): string {
  return isElectronDesktop() ? "https://www.google.com" : "https://en.wikipedia.org";
}

// A fresh "+" tab (or the fallback after closing the last one) starts blank, NOT pre-loaded with
// the homepage — the Home button (browserGoHome, below) is what actually navigates to
// defaultBrowserUrl(). Matches a real browser's distinction between "new tab" and "home": opening
// a tab isn't the same action as asking to go home, and a new tab silently jumping to
// Google/Wikipedia read as unwanted/surprising. The Browser studio's VERY FIRST tab is the one
// exception — that one IS meant to land somewhere useful (see initialBrowserTab below), same as a
// real browser opening to its homepage/restored session rather than a blank New Tab Page.
const BLANK_TAB_URL = "about:blank";

function newBrowserTab(): BrowserTab {
  const id = randomId();
  return { id, history: [BLANK_TAB_URL], historyIndex: 0, reloadTick: 0 };
}

function initialBrowserTab(): BrowserTab {
  const id = randomId();
  return { id, history: [defaultBrowserUrl()], historyIndex: 0, reloadTick: 0 };
}
const STORAGE_KEY = "veasna-os:shell-mode";
const WALLPAPER_STORAGE_KEY = "veasna-os:wallpaper";
const THEME_STORAGE_KEY = "veasna-os:theme";
const PINNED_STORAGE_KEY = "veasna-os:pinned-taskbar";
const TASKBAR_AUTO_HIDE_KEY = "veasna-os:taskbar-auto-hide";
const TASKBAR_ALIGNMENT_KEY = "veasna-os:taskbar-alignment";
const TASKBAR_SHOW_CLOCK_KEY = "veasna-os:taskbar-show-clock";
const COMPANION_VISIBLE_KEY = "veasna-os:rixie-companion-visible";
const VOLUME_KEY = "veasna-os:volume";
const MUTED_KEY = "veasna-os:muted";
const BRIGHTNESS_KEY = "veasna-os:brightness";

function defaultRect(body: CelestialBody, cascadeIndex: number): WindowRect {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  // Browser has no `launchUrl` (it's a special-cased panel, not an embedded studio app) but still
  // wants the same roomy default size as one — a cramped 480px browser window isn't very usable.
  const wide = Boolean(body.launchUrl) || body.id === "browser";
  const width = wide ? Math.min(vw * 0.85, 1200) : Math.min(vw * 0.5, 480);
  const height = wide ? Math.min(vh * 0.82, 800) : Math.min(vh * 0.6, 560);
  const offset = (cascadeIndex % 6) * 28;

  return {
    x: Math.max(16, (vw - width) / 2 + offset),
    y: Math.max(16, (vh - height) / 2 + offset),
    width,
    height,
  };
}

export default function VeasnaShell() {
  const [mode, setMode] = useState<ShellMode>("list");
  const [openWindows, setOpenWindows] = useState<OpenWindow[]>([]);
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [wallpaper, setWallpaper] = useState<string>(DEFAULT_WALLPAPER);
  const [theme, setTheme] = useState<ThemeMode>(DEFAULT_THEME);
  const [viewers, setViewers] = useState<ViewerSummary[]>([]);
  const [desktopEntries, setDesktopEntries] = useState<DesktopEntrySummary[]>([]);
  const [pinnedIds, setPinnedIds] = useState<PinnableId[]>([]);
  const [taskbarAutoHide, setTaskbarAutoHide] = useState(false);
  const [taskbarAlignment, setTaskbarAlignment] = useState<TaskbarAlignment>("left");
  const [taskbarShowClock, setTaskbarShowClock] = useState(true);
  // Real controls, not cosmetic: volume actually scales the Cosmos ambient drone's gain (the one
  // real audio source in the OS — see ambientAudio.ts), and brightness actually applies a
  // brightness() filter to the whole screen (see the document.body effect below).
  const [volume, setVolume] = useState(70);
  const [muted, setMuted] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [taskbarRevealed, setTaskbarRevealed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [taskManagerOpen, setTaskManagerOpen] = useState(false);
  const [taskManagerMinimized, setTaskManagerMinimized] = useState(false);
  const [taskManagerZ, setTaskManagerZ] = useState(0);
  const [aboutOsOpen, setAboutOsOpen] = useState(false);
  const [aboutOsMinimized, setAboutOsMinimized] = useState(false);
  const [aboutOsZ, setAboutOsZ] = useState(0);
  const [osUpdateOpen, setOsUpdateOpen] = useState(false);
  const [osUpdateMinimized, setOsUpdateMinimized] = useState(false);
  const [osUpdateZ, setOsUpdateZ] = useState(0);
  const [rixieOpen, setRixieOpen] = useState(false);
  const [rixieMinimized, setRixieMinimized] = useState(false);
  const [rixieZ, setRixieZ] = useState(0);
  // A hidden, just-for-you feature — no menu item or setting reveals it, only the secret
  // Ctrl+Shift+R shortcut below. Persisted so it stays revealed across reloads once toggled on,
  // same as any other real preference, until explicitly toggled off again.
  const [companionVisible, setCompanionVisible] = useState(false);
  const [rixieActivity, setRixieActivity] = useState<RixieCompanionState>({ status: "idle" });
  // A folder/file result picked from search while in 3D mode needs List mode mounted first (that's
  // where `TraditionalShell`/`FileManager` live) — this holds the pending open until the mode-switch
  // effect below sees `traditionalShellRef` actually attached to the freshly-mounted instance.
  const pendingDesktopOpenRef = useRef<{ path: string; kind: "folder" | "file"; name: string } | null>(null);
  // Same idea, for a pinned/searched web app opened while still in 3D mode.
  const pendingWebAppOpenRef = useRef<string | null>(null);
  // Lifted above Window (which unmounts its children on minimize) so a running/completed
  // terminal session survives minimize/restore instead of losing its output and cwd.
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [terminalCwd, setTerminalCwd] = useState("");
  const terminalSessionIdRef = useRef<string>("");
  if (!terminalSessionIdRef.current) {
    terminalSessionIdRef.current = randomId();
  }
  // Same lift-above-Window reasoning as the terminal state above — losing your place/history on every
  // minimize would make the browser far less useful than a real one. Multiple tabs, each with its
  // own independent history stack, rather than one shared history — matching a real browser.
  // Restored from localStorage when a previous session left one behind (see browserSession.ts) —
  // a real browser reopens to wherever you left off, not a blank slate every single time.
  const [browserTabs, setBrowserTabs] = useState<BrowserTab[]>(() => loadBrowserSession()?.tabs ?? [initialBrowserTab()]);
  const [activeBrowserTabId, setActiveBrowserTabId] = useState<string>(() => loadBrowserSession()?.activeTabId ?? browserTabs[0].id);

  // Saves on every tab/history/active-tab change rather than threading an explicit save call
  // through each of the many functions that can change them (navigate/back/forward/reload/new
  // tab/close tab/duplicate/open-in-browser) — one effect covers all of them by construction,
  // instead of relying on remembering to add a save call to every future one too.
  useEffect(() => {
    saveBrowserSession({ tabs: browserTabs, activeTabId: activeBrowserTabId });
  }, [browserTabs, activeBrowserTabId]);

  const zRef = useRef(10);
  const openedCountRef = useRef(0);
  const taskbarWrapperRef = useRef<HTMLDivElement>(null);
  const traditionalShellRef = useRef<TraditionalShellHandle>(null);

  // Electron's <webview> internals report an in-flight navigation getting aborted (e.g. a fast
  // redirect chain superseding itself, or the element unmounting mid-load) via a direct
  // console.error("Unexpected error while loading URL ...") call from its own preload script —
  // confirmed by checking the actual message source, not assumed: an `unhandledrejection` listener
  // does nothing for it, since it's a synchronous console.error, not a rejected promise. Next's dev
  // overlay hooks console.error directly, which is why this was surfacing as a full "Console
  // Error" overlay. Not a real failure — happens on completely normal multi-redirect flows (e.g.
  // Google sign-in) and on React 18 StrictMode's intentional dev-mode double-mount. Matched on the
  // IPC channel name alone rather than also requiring "ERR_ABORTED" in the message text — the
  // error code sometimes comes through as an empty string instead ("Error:  (-3) loading ..."),
  // and GUEST_VIEW_MANAGER_CALL is exclusively used for <webview> navigation error reporting, so
  // there's nothing else this channel name could legitimately match. Original console.error is
  // restored on unmount rather than left patched forever.
  useEffect(() => {
    if (!isElectronDesktop()) return;
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      const text = args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ");
      if (text.includes("GUEST_VIEW_MANAGER_CALL")) return;
      originalError(...args);
    };
    return () => {
      console.error = originalError;
    };
  }, []);

  useEffect(() => {
    if (!startMenuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (taskbarWrapperRef.current && !taskbarWrapperRef.current.contains(e.target as Node)) {
        setStartMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [startMenuOpen]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "3d" || saved === "list") {
      setMode(saved);
    }
    const savedWallpaper = localStorage.getItem(WALLPAPER_STORAGE_KEY);
    if (
      savedWallpaper &&
      (WALLPAPER_PRESETS.some((p) => p.id === savedWallpaper) || isCustomWallpaper(savedWallpaper))
    ) {
      setWallpaper(savedWallpaper);
    }
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme && THEME_PRESETS.some((t) => t.id === savedTheme)) {
      setTheme(savedTheme as ThemeMode);
    }
    const savedPinned = localStorage.getItem(PINNED_STORAGE_KEY);
    if (savedPinned) {
      try {
        const parsed: unknown = JSON.parse(savedPinned);
        // No longer validated against a fixed set (PinnableId is now any desktop entry id —
        // studio/filemanager/webapp/folder/file/taskmanager/aboutos/osupdate) — a stale id whose
        // target no longer exists (an uninstalled app, a deleted file) already resolves to nothing
        // and gets silently omitted at render time (see Taskbar.tsx's pinnedEntries), so there's
        // nothing meaningful to validate here beyond "is this actually an array of strings".
        if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) {
          setPinnedIds(parsed as PinnableId[]);
        }
      } catch {
        // ignore corrupt storage
      }
    }
    setTaskbarAutoHide(localStorage.getItem(TASKBAR_AUTO_HIDE_KEY) === "true");
    const savedAlignment = localStorage.getItem(TASKBAR_ALIGNMENT_KEY);
    if (savedAlignment === "left" || savedAlignment === "center") {
      setTaskbarAlignment(savedAlignment);
    }
    const savedShowClock = localStorage.getItem(TASKBAR_SHOW_CLOCK_KEY);
    if (savedShowClock === "false") setTaskbarShowClock(false);
    if (localStorage.getItem(COMPANION_VISIBLE_KEY) === "true") setCompanionVisible(true);
    const savedVolume = Number(localStorage.getItem(VOLUME_KEY));
    if (Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 100) setVolume(savedVolume);
    if (localStorage.getItem(MUTED_KEY) === "true") setMuted(true);
    const savedBrightness = Number(localStorage.getItem(BRIGHTNESS_KEY));
    if (Number.isFinite(savedBrightness) && savedBrightness >= 30 && savedBrightness <= 150) setBrightness(savedBrightness);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-os-theme", theme);
  }, [theme]);

  useEffect(() => {
    ambientAudio.setVolume(volume / 100);
    localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume]);

  useEffect(() => {
    ambientAudio.setMuted(muted);
    localStorage.setItem(MUTED_KEY, String(muted));
  }, [muted]);

  // Applied to document.body directly, not a wrapping div around this component's own JSX — most
  // actual window content here (Window.tsx, FloatingWindow.tsx, every dialog) is portaled straight
  // to document.body, which escapes any CSS filter set on an ancestor higher up in the React tree
  // but not the rendered DOM (a portal is a real child of body, not of this component's own root).
  // A filter directly on body is the one place that actually reaches all of it at once.
  useEffect(() => {
    document.body.style.filter = brightness === 100 ? "" : `brightness(${brightness}%)`;
    localStorage.setItem(BRIGHTNESS_KEY, String(brightness));
    return () => {
      document.body.style.filter = "";
    };
  }, [brightness]);

  // Global search shortcut — Ctrl+K / Cmd+K, plus Ctrl+Space / Cmd+Space as a second binding (chosen
  // as the closest capturable stand-in for "the Windows key" — a bare Meta/Super keypress can't
  // actually be intercepted from a webpage, the OS swallows it before any page JS ever sees it, so
  // there's no way to make the literal Windows key itself open this). `e.code` (not `e.key`) for the
  // space check since it's layout-independent and unambiguous regardless of what " " maps to.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (mod && e.code === "Space") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      // Hidden RixieCompanion toggle — deliberately not documented or exposed in any menu/setting,
      // see companionVisible's declaration above.
      if (mod && e.shiftKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        setCompanionVisible((prev) => {
          const next = !prev;
          localStorage.setItem(COMPANION_VISIBLE_KEY, String(next));
          return next;
        });
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Flushes a folder/file result picked from search while still in 3D mode, once the mode switch to
  // "list" actually lands and `TraditionalShell` (and its ref) exist to receive it.
  useEffect(() => {
    if (mode === "list" && pendingDesktopOpenRef.current && traditionalShellRef.current) {
      const pending = pendingDesktopOpenRef.current;
      pendingDesktopOpenRef.current = null;
      traditionalShellRef.current.openDesktopPath(pending.path, pending.kind, pending.name);
    }
    if (mode === "list" && pendingWebAppOpenRef.current && traditionalShellRef.current) {
      const id = pendingWebAppOpenRef.current;
      pendingWebAppOpenRef.current = null;
      traditionalShellRef.current.openWebApp(id);
    }
  }, [mode]);

  function handleModeChange(next: ShellMode) {
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  function openDesktopPathFromSearch(path: string, kind: "folder" | "file", name: string) {
    if (mode === "list" && traditionalShellRef.current) {
      traditionalShellRef.current.openDesktopPath(path, kind, name);
      return;
    }
    pendingDesktopOpenRef.current = { path, kind, name };
    handleModeChange("list");
  }

  // Same mode-aware pattern as openDesktopPathFromSearch — used by both search and pinned webapp
  // taskbar buttons, since either can be triggered while still in 3D mode.
  function openWebApp(id: string) {
    if (mode === "list" && traditionalShellRef.current) {
      traditionalShellRef.current.openWebApp(id);
      return;
    }
    pendingWebAppOpenRef.current = id;
    handleModeChange("list");
  }

  // Mode-aware "open File Manager" — shared by the search overlay and the taskbar/Start-menu File
  // Manager entry, both of which can be triggered while still in 3D mode (`TraditionalShell`, which
  // owns the real file manager windows, only mounts in List mode).
  function openFileManager() {
    if (mode === "list" && traditionalShellRef.current) {
      traditionalShellRef.current.openDesktopFileManager();
      return;
    }
    pendingDesktopOpenRef.current = { path: "", kind: "folder", name: "Desktop" };
    handleModeChange("list");
  }

  function handleWallpaperChange(id: string) {
    setWallpaper(id);
    try {
      localStorage.setItem(WALLPAPER_STORAGE_KEY, id);
    } catch {
      // Custom image too large for localStorage quota — still applied for this session, just won't persist across reloads.
    }
  }

  function handleThemeChange(next: ThemeMode) {
    setTheme(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
  }

  function handleTogglePin(id: PinnableId) {
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id];
      localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function handleToggleTaskbarAutoHide() {
    setTaskbarAutoHide((prev) => {
      const next = !prev;
      localStorage.setItem(TASKBAR_AUTO_HIDE_KEY, String(next));
      return next;
    });
  }

  function handleTaskbarAlignmentChange(next: TaskbarAlignment) {
    setTaskbarAlignment(next);
    localStorage.setItem(TASKBAR_ALIGNMENT_KEY, next);
  }

  function handleToggleTaskbarShowClock() {
    setTaskbarShowClock((prev) => {
      const next = !prev;
      localStorage.setItem(TASKBAR_SHOW_CLOCK_KEY, String(next));
      return next;
    });
  }

  function nextZ() {
    zRef.current += 1;
    return zRef.current;
  }

  function openApp(body: CelestialBody) {
    // Rixie isn't a studio you "launch" anymore — she's core to the OS, always reachable via her
    // own taskbar icon (see Taskbar below). Clicking her 3D sun or any lingering desktop entry
    // opens the same real chat window instead of a generic studio Window pointed at a URL.
    if (body.id === "rixie") {
      openRixie();
      return;
    }
    setStartMenuOpen(false);
    setOpenWindows((prev) => {
      const existing = prev.find((w) => w.body.id === body.id);
      if (existing) {
        return prev.map((w) =>
          w.body.id === body.id ? { ...w, minimized: false, z: nextZ() } : w
        );
      }
      const cascadeIndex = openedCountRef.current++;
      return [
        ...prev,
        {
          body,
          minimized: false,
          maximized: false,
          z: nextZ(),
          rect: defaultRect(body, cascadeIndex),
        },
      ];
    });
  }

  /** Runs one `cd` in the shared terminal session directly against `/api/terminal`, bypassing
   *  `TerminalPanel` (which may not even be mounted right now if the Terminal window is minimized
   *  or wasn't open yet) — mirrors the same request/response shape `TerminalPanel.runCommand` uses,
   *  just without the live-streaming reader loop, since a `cd` response is never actually chunked. */
  async function execTerminalCommand(command: string): Promise<{ cwd: string } | null> {
    const res = await fetch("/api/terminal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "exec", sessionId: terminalSessionIdRef.current, command }),
    });
    const text = await res.text();
    const markerIdx = text.indexOf(TERMINAL_META_MARKER);
    if (markerIdx === -1) return null;
    try {
      return JSON.parse(text.slice(markerIdx + TERMINAL_META_MARKER.length));
    } catch {
      return null;
    }
  }

  /** "Open in Terminal" for the Desktop/File Manager right-click menus. The terminal's cwd is a real
   *  absolute OS path the client never learns ahead of time (same "never hardcode/expose the sandbox
   *  root" rule as the files API) — so getting there is two relative `cd`s instead of one absolute
   *  one: `cd ~` first (the terminal backend special-cases `~` as an unconditional jump to the
   *  workspace root, regardless of the session's current directory), then `cd .desktop/<relPath>`,
   *  which now resolves relative to that known-good root. */
  async function openTerminalAt(desktopRelPath: string) {
    const terminalBody = CELESTIAL_BODIES.find((b) => b.id === "terminal");
    if (!terminalBody) return;
    openApp(terminalBody);
    const promptCwd = terminalCwd;
    await execTerminalCommand("cd ~");
    const target = desktopRelPath ? `.desktop/${desktopRelPath}` : ".desktop";
    const meta = await execTerminalCommand(`cd "${target}"`);
    if (meta?.cwd) {
      setTerminalCwd(meta.cwd);
      setTerminalLines((prev) => [...prev, `${promptCwd}> cd "${target}"`]);
    }
  }

  function updateBrowserTab(tabId: string, updater: (tab: BrowserTab) => BrowserTab) {
    setBrowserTabs((prev) => prev.map((t) => (t.id === tabId ? updater(t) : t)));
  }
  function browserNavigate(tabId: string, url: string) {
    updateBrowserTab(tabId, (t) => {
      const truncated = t.history.slice(0, t.historyIndex + 1);
      const history = [...truncated, url];
      return { ...t, history, historyIndex: history.length - 1 };
    });
  }
  function browserGoBack(tabId: string) {
    updateBrowserTab(tabId, (t) => ({ ...t, historyIndex: Math.max(0, t.historyIndex - 1) }));
  }
  function browserGoForward(tabId: string) {
    updateBrowserTab(tabId, (t) => ({ ...t, historyIndex: Math.min(t.history.length - 1, t.historyIndex + 1) }));
  }
  function browserReload(tabId: string) {
    updateBrowserTab(tabId, (t) => ({ ...t, reloadTick: t.reloadTick + 1 }));
  }
  function browserGoHome(tabId: string) {
    browserNavigate(tabId, defaultBrowserUrl());
  }
  function browserNewTab() {
    const tab = newBrowserTab();
    setBrowserTabs((prev) => [...prev, tab]);
    setActiveBrowserTabId(tab.id);
  }
  function browserCloseTab(tabId: string) {
    setBrowserTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      if (idx === -1) return prev;
      const remaining = prev.filter((t) => t.id !== tabId);
      if (remaining.length === 0) {
        const fresh = newBrowserTab();
        setActiveBrowserTabId(fresh.id);
        return [fresh];
      }
      if (tabId === activeBrowserTabId) {
        setActiveBrowserTabId(remaining[Math.max(0, idx - 1)].id);
      }
      return remaining;
    });
  }
  function browserDuplicateTab(tabId: string) {
    const source = browserTabs.find((t) => t.id === tabId);
    if (!source) return;
    const id = randomId();
    const duplicate: BrowserTab = { id, history: [...source.history], historyIndex: source.historyIndex, reloadTick: 0 };
    setBrowserTabs((prev) => [...prev, duplicate]);
    setActiveBrowserTabId(id);
  }

  /** "Install as App" from the Browser studio's toolbar — delegates to TraditionalShell (owner of
   *  the desktop's installedApps/order state) via its imperative handle, since <Window> (where
   *  BrowserPanel actually lives) is a sibling of TraditionalShell, not a child of it. Only a no-op
   *  while in 3D cosmos mode, where TraditionalShell isn't mounted to receive it — desktop icons
   *  are a list-view concept, so there's nowhere for the new icon to appear there anyway. */
  function installWebAppFromBrowser(name: string, url: string) {
    traditionalShellRef.current?.installWebApp(name, url);
  }

  /** "Open in Browser" for an .html/.htm file (Desktop or File Manager) — opens a NEW tab in the
   *  SAME shared Browser studio real sites use, rather than navigating over whatever's already in
   *  the active tab (that would silently blow away a real page the user might still be on). Then
   *  opens/focuses the Browser window, matching what double-clicking an HTML file does on a real
   *  OS (renders it, doesn't open a text editor). */
  function openInBrowser(url: string) {
    const id = randomId();
    const tab: BrowserTab = { id, history: [url], historyIndex: 0, reloadTick: 0 };
    setBrowserTabs((prev) => [...prev, tab]);
    setActiveBrowserTabId(id);
    const browserBody = CELESTIAL_BODIES.find((b) => b.id === "browser");
    if (browserBody) openApp(browserBody);
  }

  function closeApp(id: StudioId) {
    setOpenWindows((prev) => prev.filter((w) => w.body.id !== id));
  }

  function toggleMinimize(id: StudioId) {
    setOpenWindows((prev) =>
      prev.map((w) =>
        w.body.id === id
          ? { ...w, minimized: !w.minimized, z: w.minimized ? nextZ() : w.z }
          : w
      )
    );
  }

  function toggleMaximize(id: StudioId) {
    setOpenWindows((prev) =>
      prev.map((w) => {
        if (w.body.id !== id) return w;
        if (w.maximized) {
          return { ...w, maximized: false, rect: w.preMaximizeRect ?? w.rect, z: nextZ() };
        }
        return { ...w, maximized: true, preMaximizeRect: w.rect, z: nextZ() };
      })
    );
  }

  function updateRect(id: StudioId, rect: WindowRect) {
    setOpenWindows((prev) => prev.map((w) => (w.body.id === id ? { ...w, rect } : w)));
  }

  function restoreToRect(id: StudioId, rect: WindowRect) {
    setOpenWindows((prev) =>
      prev.map((w) => (w.body.id === id ? { ...w, maximized: false, rect } : w))
    );
  }

  function focusApp(id: StudioId) {
    setOpenWindows((prev) => prev.map((w) => (w.body.id === id ? { ...w, z: nextZ() } : w)));
  }

  /** "Switch to" from Task Manager — unminimizes (if needed) and brings to front in one step,
   *  unlike `toggleMinimize` (which would re-minimize an already-visible window) or `focusApp`
   *  (which doesn't unminimize at all). */
  function switchToApp(id: StudioId) {
    setOpenWindows((prev) => prev.map((w) => (w.body.id === id ? { ...w, minimized: false, z: nextZ() } : w)));
  }

  function openTaskManager() {
    setTaskManagerOpen(true);
    setTaskManagerMinimized(false);
    setTaskManagerZ(nextZ());
  }

  function openAboutOS() {
    setAboutOsOpen(true);
    setAboutOsMinimized(false);
    setAboutOsZ(nextZ());
  }

  function openOSUpdate() {
    setOsUpdateOpen(true);
    setOsUpdateMinimized(false);
    setOsUpdateZ(nextZ());
  }

  function openRixie() {
    setRixieOpen(true);
    setRixieMinimized(false);
    setRixieZ(nextZ());
  }

  /** Rixie's desktop_open_studio tool only validates a studio id server-side — this performs the
   *  real open, reusing the exact same openApp() a user's own icon/taskbar click goes through
   *  (including its "rixie" special-case redirecting to openRixie() instead of a generic Window). */
  function openStudioById(id: string) {
    const body = CELESTIAL_BODIES.find((b) => b.id === id);
    if (body) openApp(body);
  }

  /** What's actually happening in the shell right now, in the terms Rixie's system prompt
   *  understands — read fresh at send-time (see RixieWindow's `getContext` prop) rather than
   *  snapshotted once, so a long-idle chat window still reports what's CURRENTLY open. Only real,
   *  currently-true state — no inferred intent, matching Task Manager's own "no fabricated
   *  numbers" discipline. */
  function getRixieContext(): OsContext {
    const visibleWindows = openWindows.filter((w) => !w.minimized);
    const activeWindow = visibleWindows.reduce<OpenWindow | null>(
      (top, w) => (!top || w.z > top.z ? w : top),
      null
    );
    const openFolder = viewers.find((v) => v.kind === "folder" && !v.minimized);
    const openFile = viewers.find((v) => v.kind === "file" && !v.minimized);
    const openApps = viewers.filter((v) => v.kind === "webapp" && !v.minimized).map((v) => v.name);
    return {
      mode,
      openStudios: visibleWindows.map((w) => w.body.name),
      activeStudio: activeWindow?.body.name ?? null,
      terminalCwd: openWindows.some((w) => w.body.id === "terminal") ? terminalCwd : null,
      browsingPath: openFolder ? openFolder.id : null,
      openFile: openFile ? openFile.name : null,
      openApps,
      companionActive: companionVisible,
    };
  }

  // The taskbar is always rendered now — including a bare 3D view with nothing open/pinned — so the
  // Universe/Desktop toggle can live inside it permanently instead of needing a separate floating
  // fallback for that state. While auto-hide is on, it still doesn't permanently occupy screen space
  // (floats on top only when revealed), so windows should size to the full viewport in that case.
  const taskbarReserve = !taskbarAutoHide ? 44 : 0;

  return (
    <>
      {mode === "3d" ? (
        <CosmosCanvas onOpenApp={openApp} />
      ) : (
        <TraditionalShell
          ref={traditionalShellRef}
          getNextZIndex={nextZ}
          onOpenApp={openApp}
          wallpaper={wallpaper}
          onViewersChange={setViewers}
          onDesktopEntriesChange={setDesktopEntries}
          pinnedIds={pinnedIds}
          onTogglePin={handleTogglePin}
          taskbarReserve={taskbarReserve}
          onOpenTerminalAt={openTerminalAt}
          onOpenTaskManager={openTaskManager}
          onOpenAboutOS={openAboutOS}
          onOpenOSUpdate={openOSUpdate}
          onOpenInBrowser={openInBrowser}
        />
      )}

      {rixieOpen && (
        <RixieWindow
          zIndex={rixieZ}
          taskbarReserve={taskbarReserve}
          minimized={rixieMinimized}
          onClose={() => setRixieOpen(false)}
          onMinimize={() => setRixieMinimized(true)}
          onFocus={() => setRixieZ(nextZ())}
          getContext={getRixieContext}
          onOpenPath={openDesktopPathFromSearch}
          onOpenStudio={openStudioById}
          onSetTheme={handleThemeChange}
          onActivityChange={setRixieActivity}
        />
      )}

      {companionVisible && <RixieCompanion state={rixieActivity} onClick={openRixie} />}

      {taskManagerOpen && (
        <TaskManagerWindow
          openWindows={openWindows}
          icons={STUDIO_ICONS}
          viewers={viewers}
          zIndex={taskManagerZ}
          taskbarReserve={taskbarReserve}
          minimized={taskManagerMinimized}
          onClose={() => setTaskManagerOpen(false)}
          onMinimize={() => setTaskManagerMinimized(true)}
          onFocus={() => setTaskManagerZ(nextZ())}
          onEndApp={closeApp}
          onSwitchToApp={switchToApp}
          onEndViewer={(id) => traditionalShellRef.current?.closeViewer(id)}
          onSwitchToViewer={(id) => traditionalShellRef.current?.focusViewer(id)}
        />
      )}

      {aboutOsOpen && (
        <AboutOSWindow
          zIndex={aboutOsZ}
          taskbarReserve={taskbarReserve}
          minimized={aboutOsMinimized}
          onClose={() => setAboutOsOpen(false)}
          onMinimize={() => setAboutOsMinimized(true)}
          onFocus={() => setAboutOsZ(nextZ())}
        />
      )}

      {osUpdateOpen && (
        <OSUpdateWindow
          zIndex={osUpdateZ}
          taskbarReserve={taskbarReserve}
          minimized={osUpdateMinimized}
          onClose={() => setOsUpdateOpen(false)}
          onMinimize={() => setOsUpdateMinimized(true)}
          onFocus={() => setOsUpdateZ(nextZ())}
        />
      )}

      {openWindows.map(
        (win) =>
          !win.minimized && (
            <Window
              key={win.body.id}
              win={win}
              icon={STUDIO_ICONS[win.body.id]}
              taskbarReserve={taskbarReserve}
              onClose={() => closeApp(win.body.id)}
              onMinimize={() => toggleMinimize(win.body.id)}
              onMaximizeToggle={() => toggleMaximize(win.body.id)}
              onFocus={() => focusApp(win.body.id)}
              onRectChange={(rect) => updateRect(win.body.id, rect)}
              onRestore={(rect) => restoreToRect(win.body.id, rect)}
              wallpaper={wallpaper}
              onWallpaperChange={handleWallpaperChange}
              theme={theme}
              onThemeChange={handleThemeChange}
              taskbarAutoHide={taskbarAutoHide}
              onToggleTaskbarAutoHide={handleToggleTaskbarAutoHide}
              taskbarAlignment={taskbarAlignment}
              onTaskbarAlignmentChange={handleTaskbarAlignmentChange}
              taskbarShowClock={taskbarShowClock}
              onToggleTaskbarShowClock={handleToggleTaskbarShowClock}
              onOpenAboutOS={openAboutOS}
              onOpenOSUpdate={openOSUpdate}
              terminalSessionId={terminalSessionIdRef.current}
              terminalLines={terminalLines}
              onTerminalLinesChange={setTerminalLines}
              terminalCwd={terminalCwd}
              onTerminalCwdChange={setTerminalCwd}
              browserTabs={browserTabs}
              activeBrowserTabId={activeBrowserTabId}
              onBrowserNavigate={browserNavigate}
              onBrowserBack={browserGoBack}
              onBrowserForward={browserGoForward}
              onBrowserReload={browserReload}
              onBrowserHome={browserGoHome}
              onBrowserNewTab={browserNewTab}
              onBrowserCloseTab={browserCloseTab}
              onBrowserSwitchTab={setActiveBrowserTabId}
              onBrowserDuplicateTab={browserDuplicateTab}
              onInstallApp={installWebAppFromBrowser}
            />
          )
      )}

      {taskbarAutoHide && !startMenuOpen && !taskbarRevealed && (
        <div
          className="fixed inset-x-0 bottom-0 h-1.5"
          style={{ zIndex: 8999 }}
          onMouseEnter={() => setTaskbarRevealed(true)}
        />
      )}

      <div
        ref={taskbarWrapperRef}
        className={`fixed inset-x-0 bottom-0 transition-transform duration-200 ${
          taskbarAutoHide && !startMenuOpen && !taskbarRevealed ? "translate-y-full" : ""
        }`}
        style={{ zIndex: 9000 }}
        onMouseLeave={() => setTaskbarRevealed(false)}
      >
        <Taskbar
          bodies={CELESTIAL_BODIES}
          icons={STUDIO_ICONS}
          openWindows={openWindows}
          onToggleMinimize={toggleMinimize}
          viewers={viewers}
          onToggleViewerMinimize={(id) => traditionalShellRef.current?.toggleViewerMinimize(id)}
          desktopEntries={desktopEntries}
          pinnedIds={pinnedIds}
          onTogglePin={handleTogglePin}
          onOpenWebApp={openWebApp}
          onOpenDesktopPath={(id, kind, name) => traditionalShellRef.current?.openDesktopPath(id, kind, name)}
          taskManagerOpen={taskManagerOpen}
          aboutOSOpen={aboutOsOpen}
          osUpdateOpen={osUpdateOpen}
          onOpenTaskManager={openTaskManager}
          onOpenAboutOS={openAboutOS}
          onOpenOSUpdate={openOSUpdate}
          alignment={taskbarAlignment}
          showClock={taskbarShowClock}
          startMenuOpen={startMenuOpen}
          onToggleStartMenu={() => setStartMenuOpen((o) => !o)}
          onOpenApp={openApp}
          onOpenFileManager={() => {
            setStartMenuOpen(false);
            openFileManager();
          }}
          onOpenTaskbarSettings={() => {
            const settingsBody = CELESTIAL_BODIES.find((b) => b.id === "settings");
            if (settingsBody) openApp(settingsBody);
          }}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenRixie={openRixie}
          mode={mode}
          onModeChange={handleModeChange}
          volume={volume}
          muted={muted}
          onVolumeChange={setVolume}
          onToggleMute={() => setMuted((m) => !m)}
          brightness={brightness}
          onBrightnessChange={setBrightness}
        />
      </div>

      {searchOpen && (
        <SearchOverlay
          bodies={CELESTIAL_BODIES}
          icons={STUDIO_ICONS}
          desktopEntries={desktopEntries}
          onOpenApp={openApp}
          onOpenFileManager={openFileManager}
          onOpenDesktopPath={openDesktopPathFromSearch}
          onOpenWebApp={openWebApp}
          onOpenTaskManager={openTaskManager}
          onOpenAboutOS={openAboutOS}
          onOpenOSUpdate={openOSUpdate}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </>
  );
}
