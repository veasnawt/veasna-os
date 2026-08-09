"use client";

import React, { useEffect, useRef, useState } from "react";
import CosmosCanvas from "./CosmosCanvas";
import TraditionalShell, { STUDIO_ICONS, TraditionalShellHandle } from "./components/TraditionalShell";
import Window from "./components/Window";
import Taskbar from "./components/Taskbar";
import SearchOverlay from "./components/SearchOverlay";
import TaskManagerWindow from "./components/TaskManagerWindow";
import AboutOSWindow from "./components/AboutOSWindow";
import OSUpdateWindow from "./components/OSUpdateWindow";
import RixieWindow, { OsContext } from "./components/RixieWindow";
import { CELESTIAL_BODIES } from "./constants";
import { CelestialBody, OpenWindow, PinnableId, ShellMode, StudioId, TaskbarAlignment, WindowRect } from "./types";
import { DEFAULT_WALLPAPER, WALLPAPER_PRESETS, isCustomWallpaper } from "./utils/wallpaperGenerator";
import { DEFAULT_THEME, THEME_PRESETS, ThemeMode } from "./utils/theme";
import { ViewerSummary } from "./utils/desktopItems";

const TERMINAL_META_MARKER = "@@VEASNA_TERMINAL_META@@";
// Most major search engines (Google, Bing, DuckDuckGo) send X-Frame-Options/CSP headers that refuse
// iframe embedding entirely — confirmed empirically, not assumed — so the very first thing a user saw
// on opening Browser was a blank/broken-page icon. Wikipedia allows framing and is actually useful
// content, so it's the default instead; the address bar still treats a search-looking query as a
// Google search (see `resolveAddress` in BrowserPanel.tsx), that just isn't a good *landing* page.
const DEFAULT_BROWSER_URL = "https://en.wikipedia.org";
const STORAGE_KEY = "veasna-os:shell-mode";
const WALLPAPER_STORAGE_KEY = "veasna-os:wallpaper";
const THEME_STORAGE_KEY = "veasna-os:theme";
const PINNED_STORAGE_KEY = "veasna-os:pinned-taskbar";
const TASKBAR_AUTO_HIDE_KEY = "veasna-os:taskbar-auto-hide";
const TASKBAR_ALIGNMENT_KEY = "veasna-os:taskbar-alignment";
const TASKBAR_SHOW_CLOCK_KEY = "veasna-os:taskbar-show-clock";

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
  const [pinnedIds, setPinnedIds] = useState<PinnableId[]>([]);
  const [taskbarAutoHide, setTaskbarAutoHide] = useState(false);
  const [taskbarAlignment, setTaskbarAlignment] = useState<TaskbarAlignment>("left");
  const [taskbarShowClock, setTaskbarShowClock] = useState(true);
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
  // A folder/file result picked from search while in 3D mode needs List mode mounted first (that's
  // where `TraditionalShell`/`FileManager` live) — this holds the pending open until the mode-switch
  // effect below sees `traditionalShellRef` actually attached to the freshly-mounted instance.
  const pendingDesktopOpenRef = useRef<{ path: string; kind: "folder" | "file"; name: string } | null>(null);
  // Lifted above Window (which unmounts its children on minimize) so a running/completed
  // terminal session survives minimize/restore instead of losing its output and cwd.
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [terminalCwd, setTerminalCwd] = useState("");
  const terminalSessionIdRef = useRef<string>("");
  if (!terminalSessionIdRef.current) {
    terminalSessionIdRef.current = typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random());
  }
  // Same lift-above-Window reasoning as the terminal state above — losing your place/history on every
  // minimize would make the browser far less useful than a real one.
  const [browserHistory, setBrowserHistory] = useState<string[]>([DEFAULT_BROWSER_URL]);
  const [browserHistoryIndex, setBrowserHistoryIndex] = useState(0);
  const [browserReloadTick, setBrowserReloadTick] = useState(0);
  const zRef = useRef(10);
  const openedCountRef = useRef(0);
  const taskbarWrapperRef = useRef<HTMLDivElement>(null);
  const traditionalShellRef = useRef<TraditionalShellHandle>(null);

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
        const parsed: string[] = JSON.parse(savedPinned);
        setPinnedIds(
          parsed.filter((id): id is PinnableId => id === "filemanager" || CELESTIAL_BODIES.some((b) => b.id === id))
        );
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
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-os-theme", theme);
  }, [theme]);

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

  function browserNavigate(url: string) {
    const truncated = browserHistory.slice(0, browserHistoryIndex + 1);
    const next = [...truncated, url];
    setBrowserHistory(next);
    setBrowserHistoryIndex(next.length - 1);
  }
  function browserGoBack() {
    setBrowserHistoryIndex((i) => Math.max(0, i - 1));
  }
  function browserGoForward() {
    setBrowserHistoryIndex((i) => Math.min(browserHistory.length - 1, i + 1));
  }
  function browserReload() {
    setBrowserReloadTick((t) => t + 1);
  }
  function browserGoHome() {
    browserNavigate(DEFAULT_BROWSER_URL);
  }

  /** "Open in Browser" for an .html/.htm file (Desktop or File Manager) — navigates the SAME shared
   *  Browser studio real sites use, then opens/focuses it, matching what double-clicking an HTML file
   *  does on a real OS (renders it, doesn't open a text editor). */
  function openInBrowser(url: string) {
    browserNavigate(url);
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
    return {
      mode,
      openStudios: visibleWindows.map((w) => w.body.name),
      activeStudio: activeWindow?.body.name ?? null,
      terminalCwd: openWindows.some((w) => w.body.id === "terminal") ? terminalCwd : null,
      browsingPath: openFolder ? openFolder.id : null,
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
        />
      )}

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
              browserUrl={browserHistory[browserHistoryIndex]}
              browserCanGoBack={browserHistoryIndex > 0}
              browserCanGoForward={browserHistoryIndex < browserHistory.length - 1}
              browserReloadTick={browserReloadTick}
              onBrowserNavigate={browserNavigate}
              onBrowserBack={browserGoBack}
              onBrowserForward={browserGoForward}
              onBrowserReload={browserReload}
              onBrowserHome={browserGoHome}
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
          pinnedIds={pinnedIds}
          onTogglePin={handleTogglePin}
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
        />
      </div>

      {searchOpen && (
        <SearchOverlay
          bodies={CELESTIAL_BODIES}
          icons={STUDIO_ICONS}
          onOpenApp={openApp}
          onOpenFileManager={openFileManager}
          onOpenDesktopPath={openDesktopPathFromSearch}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </>
  );
}
