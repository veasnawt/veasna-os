"use client";

import React, { useEffect, useRef, useState } from "react";
import CosmosCanvas from "./CosmosCanvas";
import TraditionalShell, { STUDIO_ICONS, TraditionalShellHandle } from "./components/TraditionalShell";
import ModeToggle from "./components/ModeToggle";
import Window from "./components/Window";
import Taskbar from "./components/Taskbar";
import { CELESTIAL_BODIES } from "./constants";
import { CelestialBody, OpenWindow, ShellMode, StudioId, TaskbarAlignment, WindowRect } from "./types";
import { DEFAULT_WALLPAPER, WALLPAPER_PRESETS, isCustomWallpaper } from "./utils/wallpaperGenerator";
import { DEFAULT_THEME, THEME_PRESETS, ThemeMode } from "./utils/theme";
import { ViewerSummary } from "./utils/desktopItems";

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

  const width = body.launchUrl ? Math.min(vw * 0.85, 1200) : Math.min(vw * 0.5, 480);
  const height = body.launchUrl ? Math.min(vh * 0.82, 800) : Math.min(vh * 0.6, 560);
  const offset = (cascadeIndex % 6) * 28;

  return {
    x: Math.max(16, (vw - width) / 2 + offset),
    y: Math.max(16, (vh - height) / 2 + offset),
    width,
    height,
  };
}

export default function VeasnaShell() {
  const [mode, setMode] = useState<ShellMode>("3d");
  const [openWindows, setOpenWindows] = useState<OpenWindow[]>([]);
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [wallpaper, setWallpaper] = useState<string>(DEFAULT_WALLPAPER);
  const [theme, setTheme] = useState<ThemeMode>(DEFAULT_THEME);
  const [viewers, setViewers] = useState<ViewerSummary[]>([]);
  const [pinnedIds, setPinnedIds] = useState<StudioId[]>([]);
  const [taskbarAutoHide, setTaskbarAutoHide] = useState(false);
  const [taskbarAlignment, setTaskbarAlignment] = useState<TaskbarAlignment>("left");
  const [taskbarShowClock, setTaskbarShowClock] = useState(true);
  const [taskbarRevealed, setTaskbarRevealed] = useState(false);
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
        setPinnedIds(parsed.filter((id): id is StudioId => CELESTIAL_BODIES.some((b) => b.id === id)));
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

  function handleModeChange(next: ShellMode) {
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
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

  function handleTogglePin(id: StudioId) {
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

  const showTaskbar = mode === "list" || openWindows.length > 0 || pinnedIds.length > 0;
  // While auto-hide is on, the taskbar doesn't permanently occupy screen space — it
  // floats on top (high z-index) only when revealed — so windows should size to the
  // full viewport rather than leaving a gap for a bar that isn't statically there.
  const taskbarReserve = showTaskbar && !taskbarAutoHide ? 44 : 0;

  return (
    <>
      <ModeToggle mode={mode} onChange={handleModeChange} />

      {mode === "3d" ? (
        <CosmosCanvas onOpenApp={openApp} />
      ) : (
        <TraditionalShell
          ref={traditionalShellRef}
          onOpenApp={openApp}
          wallpaper={wallpaper}
          onViewersChange={setViewers}
          pinnedIds={pinnedIds}
          onTogglePin={handleTogglePin}
          taskbarReserve={taskbarReserve}
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
            />
          )
      )}

      {showTaskbar && taskbarAutoHide && !startMenuOpen && !taskbarRevealed && (
        <div
          className="fixed inset-x-0 bottom-0 h-1.5"
          style={{ zIndex: 8999 }}
          onMouseEnter={() => setTaskbarRevealed(true)}
        />
      )}

      {showTaskbar && (
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
            onOpenTaskbarSettings={() => {
              const settingsBody = CELESTIAL_BODIES.find((b) => b.id === "settings");
              if (settingsBody) openApp(settingsBody);
            }}
          />
        </div>
      )}
    </>
  );
}
