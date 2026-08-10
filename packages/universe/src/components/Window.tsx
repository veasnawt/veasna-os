"use client";

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OpenWindow, TaskbarAlignment, WindowRect } from "../types";
import { ThemeMode } from "../utils/theme";
import WindowChrome from "./WindowChrome";
import StudioDetailCard from "./StudioDetailCard";
import SettingsPanel from "./SettingsPanel";
import TerminalPanel from "./TerminalPanel";
import BrowserPanel, { BrowserTab, tabLabel } from "./BrowserPanel";
import BrowserTabContextMenu from "./BrowserTabContextMenu";
import StudioFrame from "./StudioFrame";
import { faviconUrl } from "../utils/installedApps";

/** `about:blank` (a fresh tab) has no real hostname to fetch a favicon for — anything else should,
 *  but tab URLs still get a defensive try/catch since `faviconUrl` throws on a malformed URL. */
function tabFaviconUrl(url: string): string | null {
  if (url === "about:blank") return null;
  try {
    return faviconUrl(url);
  } catch {
    return null;
  }
}

interface WindowProps {
  win: OpenWindow;
  icon: React.ComponentType<{ size?: number }>;
  /** Pixels of viewport bottom to stay clear of (0 when the taskbar isn't currently occupying space, e.g. auto-hidden). */
  taskbarReserve: number;
  onClose: () => void;
  onMinimize: () => void;
  onMaximizeToggle: () => void;
  onFocus: () => void;
  onRectChange: (rect: WindowRect) => void;
  /** Restores a maximized window directly to a specific rect (used when dragging one by its title bar). */
  onRestore: (rect: WindowRect) => void;
  wallpaper: string;
  onWallpaperChange: (id: string) => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  taskbarAutoHide: boolean;
  onToggleTaskbarAutoHide: () => void;
  taskbarAlignment: TaskbarAlignment;
  onTaskbarAlignmentChange: (alignment: TaskbarAlignment) => void;
  taskbarShowClock: boolean;
  onToggleTaskbarShowClock: () => void;
  onOpenAboutOS: () => void;
  onOpenOSUpdate: () => void;
  terminalSessionId: string;
  terminalLines: string[];
  onTerminalLinesChange: (lines: string[]) => void;
  terminalCwd: string;
  onTerminalCwdChange: (cwd: string) => void;
  browserTabs: BrowserTab[];
  activeBrowserTabId: string;
  onBrowserNavigate: (tabId: string, url: string) => void;
  onBrowserBack: (tabId: string) => void;
  onBrowserForward: (tabId: string) => void;
  onBrowserReload: (tabId: string) => void;
  onBrowserHome: (tabId: string) => void;
  onBrowserNewTab: () => void;
  onBrowserCloseTab: (tabId: string) => void;
  onBrowserSwitchTab: (tabId: string) => void;
  onBrowserDuplicateTab: (tabId: string) => void;
  onInstallApp: (name: string, url: string) => void;
}

const MIN_WIDTH = 320;
const MIN_HEIGHT = 220;
const SNAP_THRESHOLD = 24;

type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const RESIZE_HANDLES: { dir: ResizeDir; className: string; cursor: string }[] = [
  { dir: "n", className: "top-0 left-2.5 right-2.5 h-1.5", cursor: "cursor-ns-resize" },
  { dir: "s", className: "bottom-0 left-2.5 right-2.5 h-1.5", cursor: "cursor-ns-resize" },
  { dir: "w", className: "left-0 top-2.5 bottom-2.5 w-1.5", cursor: "cursor-ew-resize" },
  { dir: "e", className: "right-0 top-2.5 bottom-2.5 w-1.5", cursor: "cursor-ew-resize" },
  { dir: "nw", className: "top-0 left-0 h-3 w-3", cursor: "cursor-nwse-resize" },
  { dir: "ne", className: "top-0 right-0 h-3 w-3", cursor: "cursor-nesw-resize" },
  { dir: "sw", className: "bottom-0 left-0 h-3 w-3", cursor: "cursor-nesw-resize" },
  { dir: "se", className: "bottom-0 right-0 h-3 w-3", cursor: "cursor-nwse-resize" },
];

/** The Browser studio's tab strip, rendered directly in its title bar (Chrome-style) via
 *  WindowChrome's `titleBarLeft` slot — not a separate row inside BrowserPanel's own content area.
 *  Every interactive element stops propagation on `onMouseDown`, same as the title bar's own
 *  minimize/maximize/close buttons, so clicking a tab switches it instead of also starting a
 *  window drag (the title bar's background still drags normally in the gaps between tabs). */
function BrowserTitleTabs({
  tabs,
  activeTabId,
  onSwitchTab,
  onCloseTab,
  onNewTab,
  onReload,
  onDuplicateTab,
}: {
  tabs: BrowserTab[];
  activeTabId: string;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  onReload: (tabId: string) => void;
  onDuplicateTab: (tabId: string) => void;
}) {
  const [menu, setMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);

  function closeOtherTabs(tabId: string) {
    tabs.filter((t) => t.id !== tabId).forEach((t) => onCloseTab(t.id));
  }
  function closeTabsToRight(tabId: string) {
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    tabs.slice(idx + 1).forEach((t) => onCloseTab(t.id));
  }

  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-0.5 self-stretch overflow-x-auto pl-1">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onSwitchTab(tab.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSwitchTab(tab.id);
            setMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
          }}
          title={tab.history[tab.historyIndex]}
          className={`group flex min-w-[84px] max-w-[150px] shrink-0 cursor-pointer items-center gap-1.5 self-center rounded-md px-2 py-1 text-[11px] ${
            tab.id === activeTabId
              ? "bg-[var(--os-border-strong)] text-[var(--os-text)]"
              : "text-[var(--os-text-muted)] hover:bg-[var(--os-border-strong)]/50 hover:text-[var(--os-text)]"
          }`}
        >
          {tabFaviconUrl(tab.history[tab.historyIndex]) && (
            // eslint-disable-next-line @next/next/no-img-element -- a favicon proxy URL, not an
            // optimizable local/remote asset Next's <Image> is meant for.
            <img
              src={tabFaviconUrl(tab.history[tab.historyIndex])!}
              alt=""
              className="h-3.5 w-3.5 shrink-0 rounded-sm"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <span className="min-w-0 flex-1 truncate">{tabLabel(tab.history[tab.historyIndex])}</span>
          {tabs.length > 1 && (
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              title="Close tab"
              className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-[var(--os-text-muted)] opacity-0 transition hover:bg-black/20 hover:text-[var(--os-text)] group-hover:opacity-100"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      ))}
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onNewTab}
        title="New tab"
        className="flex h-6 w-6 shrink-0 self-center items-center justify-center rounded text-[var(--os-text-muted)] transition hover:bg-[var(--os-border-strong)] hover:text-[var(--os-text)]"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </button>

      {menu && (
        <BrowserTabContextMenu
          x={menu.x}
          y={menu.y}
          canClose={tabs.length > 1}
          hasOtherTabs={tabs.length > 1}
          hasTabsToRight={tabs.findIndex((t) => t.id === menu.tabId) < tabs.length - 1}
          onNewTab={onNewTab}
          onDuplicate={() => onDuplicateTab(menu.tabId)}
          onReload={() => onReload(menu.tabId)}
          onCloseTab={() => onCloseTab(menu.tabId)}
          onCloseOtherTabs={() => closeOtherTabs(menu.tabId)}
          onCloseTabsToRight={() => closeTabsToRight(menu.tabId)}
          onDismiss={() => setMenu(null)}
        />
      )}
    </div>
  );
}

// Aero-Snap-style layouts: drag the title bar to a screen edge for a half,
// to a corner for a quarter, or to the very top (away from the corners) to maximize.
type SnapZone = "maximize" | "left-half" | "right-half" | "tl-quarter" | "tr-quarter" | "bl-quarter" | "br-quarter";

function detectSnapZone(clientX: number, clientY: number, reservedBottom: number): SnapZone | null {
  const vw = window.innerWidth;
  const vh = window.innerHeight - reservedBottom;
  const nearLeft = clientX <= SNAP_THRESHOLD;
  const nearRight = clientX >= vw - SNAP_THRESHOLD;
  const nearTop = clientY <= SNAP_THRESHOLD;
  const nearBottom = clientY >= vh - SNAP_THRESHOLD;

  if (nearLeft && nearTop) return "tl-quarter";
  if (nearRight && nearTop) return "tr-quarter";
  if (nearLeft && nearBottom) return "bl-quarter";
  if (nearRight && nearBottom) return "br-quarter";
  if (nearTop) return "maximize";
  if (nearLeft) return "left-half";
  if (nearRight) return "right-half";
  return null;
}

function getSnapZoneRect(zone: SnapZone, reservedBottom: number): WindowRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight - reservedBottom;
  const halfW = vw / 2;
  const halfH = vh / 2;

  switch (zone) {
    case "maximize":
      return { x: 0, y: 0, width: vw, height: vh };
    case "left-half":
      return { x: 0, y: 0, width: halfW, height: vh };
    case "right-half":
      return { x: halfW, y: 0, width: halfW, height: vh };
    case "tl-quarter":
      return { x: 0, y: 0, width: halfW, height: halfH };
    case "tr-quarter":
      return { x: halfW, y: 0, width: halfW, height: halfH };
    case "bl-quarter":
      return { x: 0, y: halfH, width: halfW, height: halfH };
    case "br-quarter":
      return { x: halfW, y: halfH, width: halfW, height: halfH };
  }
}

export default function Window({
  win,
  icon,
  taskbarReserve,
  onClose,
  onMinimize,
  onMaximizeToggle,
  onFocus,
  onRectChange,
  onRestore,
  wallpaper,
  onWallpaperChange,
  theme,
  onThemeChange,
  taskbarAutoHide,
  onToggleTaskbarAutoHide,
  taskbarAlignment,
  onTaskbarAlignmentChange,
  taskbarShowClock,
  onToggleTaskbarShowClock,
  onOpenAboutOS,
  onOpenOSUpdate,
  terminalSessionId,
  terminalLines,
  onTerminalLinesChange,
  terminalCwd,
  onTerminalCwdChange,
  browserTabs,
  activeBrowserTabId,
  onBrowserNavigate,
  onBrowserBack,
  onBrowserForward,
  onBrowserReload,
  onBrowserHome,
  onBrowserNewTab,
  onBrowserCloseTab,
  onBrowserSwitchTab,
  onBrowserDuplicateTab,
  onInstallApp,
}: WindowProps) {
  const dragOrigin = useRef<{ startX: number; startY: number; rect: WindowRect } | null>(null);
  const resizeOrigin = useRef<{ startX: number; startY: number; rect: WindowRect } | null>(null);
  // A single full-viewport overlay, portaled to <body> above everything (taskbar
  // included) and toggled via direct DOM mutation (not React state, which is a
  // render tick too late). Without it, a fast drag/resize crosses out of this
  // window's own bounds — into the taskbar or another window's iframe, both of
  // which are separate contexts/z-layers — breaking mousemove tracking and
  // leaving a stray native text selection wherever the cursor ended up.
  const overlayRef = useRef<HTMLDivElement>(null);
  // Snap-zone preview: updates only on zone *changes* (not every mousemove),
  // so state + re-render is fine here — unlike rect updates, which stay ref/prop driven.
  const [snapZone, setSnapZone] = useState<SnapZone | null>(null);
  const snapZoneRef = useRef<SnapZone | null>(null);

  function beginInteraction() {
    if (overlayRef.current) overlayRef.current.style.display = "block";
    document.body.classList.add("veasna-dragging");
    document.body.style.userSelect = "none";
    window.getSelection()?.removeAllRanges();
  }

  function endInteraction() {
    if (overlayRef.current) overlayRef.current.style.display = "none";
    document.body.classList.remove("veasna-dragging");
    document.body.style.userSelect = "";
  }

  function handleTitleBarMouseDown(e: React.MouseEvent) {
    onFocus();
    // Mutable: if the window starts maximized, the moment a real drag begins we
    // restore it and rebase these to the freshly-restored rect/position so the
    // rest of the drag continues seamlessly from there.
    let originX = e.clientX;
    let originY = e.clientY;
    let baseRect = win.rect;
    const wasMaximized = win.maximized;
    const reservedBottom = taskbarReserve;
    // Don't engage drag mode (blocking overlay, preventDefault, etc.) until the
    // pointer actually moves past a small threshold. Doing it immediately on
    // mousedown — even for a plain click — puts the full-viewport overlay on
    // top for that instant, which can intercept the matching mouseup and break
    // the browser's native double-click pairing (needed for maximize/restore).
    let started = false;
    const DRAG_THRESHOLD = 4;

    function handleMove(ev: MouseEvent) {
      const dx = ev.clientX - originX;
      const dy = ev.clientY - originY;

      if (!started) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        started = true;
        beginInteraction();

        if (wasMaximized) {
          // Restore to its pre-maximize size, repositioned so the point the user
          // grabbed on the (full-width) title bar stays under the cursor — same
          // feel as dragging a maximized window on a real desktop.
          const restored = win.preMaximizeRect ?? {
            x: 80,
            y: 80,
            width: Math.min(window.innerWidth * 0.6, 900),
            height: Math.min(window.innerHeight * 0.6, 650),
          };
          const grabFraction = Math.min(1, Math.max(0, originX / window.innerWidth));
          const newX = Math.max(0, Math.min(originX - grabFraction * restored.width, window.innerWidth - restored.width));
          const newY = Math.max(0, originY - 10);
          baseRect = { x: newX, y: newY, width: restored.width, height: restored.height };
          onRestore(baseRect);
          // Rebase the drag origin to "now" so subsequent deltas apply relative
          // to the just-restored rect instead of jumping.
          originX = ev.clientX;
          originY = ev.clientY;
          return;
        }
      }

      const maxX = Math.max(0, window.innerWidth - baseRect.width);
      const maxY = Math.max(0, window.innerHeight - reservedBottom - baseRect.height);
      onRectChange({
        ...baseRect,
        x: Math.max(0, Math.min(baseRect.x + dx, maxX)),
        y: Math.max(0, Math.min(baseRect.y + dy, maxY)),
      });

      const zone = detectSnapZone(ev.clientX, ev.clientY, reservedBottom);
      if (zone !== snapZoneRef.current) {
        snapZoneRef.current = zone;
        setSnapZone(zone);
      }
    }
    function handleUp() {
      if (started) {
        if (snapZoneRef.current === "maximize") {
          onMaximizeToggle();
        } else if (snapZoneRef.current) {
          onRectChange(getSnapZoneRect(snapZoneRef.current, reservedBottom));
        }
        snapZoneRef.current = null;
        setSnapZone(null);
        endInteraction();
      }
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  function handleResizeMouseDown(e: React.MouseEvent, dir: ResizeDir) {
    e.preventDefault();
    e.stopPropagation();
    if (win.maximized) return;
    onFocus();
    beginInteraction();
    resizeOrigin.current = { startX: e.clientX, startY: e.clientY, rect: win.rect };

    function handleMove(ev: MouseEvent) {
      if (!resizeOrigin.current) return;
      const dx = ev.clientX - resizeOrigin.current.startX;
      const dy = ev.clientY - resizeOrigin.current.startY;
      const rect = resizeOrigin.current.rect;
      const reservedBottom = taskbarReserve;

      let { x, y, width, height } = rect;

      if (dir.includes("e")) {
        const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - rect.x);
        width = Math.min(maxWidth, Math.max(MIN_WIDTH, rect.width + dx));
      }
      if (dir.includes("w")) {
        const rightEdge = rect.x + rect.width;
        width = Math.min(rightEdge, Math.max(MIN_WIDTH, rect.width - dx));
        x = rightEdge - width;
      }
      if (dir.includes("s")) {
        const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - reservedBottom - rect.y);
        height = Math.min(maxHeight, Math.max(MIN_HEIGHT, rect.height + dy));
      }
      if (dir.includes("n")) {
        const bottomEdge = rect.y + rect.height;
        height = Math.min(bottomEdge, Math.max(MIN_HEIGHT, rect.height - dy));
        y = bottomEdge - height;
      }

      onRectChange({ x, y, width, height });
    }
    function handleUp() {
      resizeOrigin.current = null;
      endInteraction();
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  const style: React.CSSProperties = win.maximized
    ? {
        position: "fixed",
        left: 0,
        top: 0,
        right: 0,
        bottom: taskbarReserve,
        zIndex: win.z,
      }
    : {
        position: "fixed",
        left: win.rect.x,
        top: win.rect.y,
        width: win.rect.width,
        height: win.rect.height,
        zIndex: win.z,
      };

  const previewRect = snapZone ? getSnapZoneRect(snapZone, taskbarReserve) : null;

  return (
    <>
      <div style={style} className="pointer-events-auto relative">
        <WindowChrome
          title={win.body.name}
          icon={icon}
          color={win.body.color}
          maximized={win.maximized}
          onMinimize={onMinimize}
          onMaximizeToggle={onMaximizeToggle}
          onClose={onClose}
          onFocus={onFocus}
          onTitleBarMouseDown={handleTitleBarMouseDown}
          className="h-full w-full"
          titleBarLeft={
            win.body.id === "browser" ? (
              <BrowserTitleTabs
                tabs={browserTabs}
                activeTabId={activeBrowserTabId}
                onSwitchTab={onBrowserSwitchTab}
                onCloseTab={onBrowserCloseTab}
                onNewTab={onBrowserNewTab}
                onReload={onBrowserReload}
                onDuplicateTab={onBrowserDuplicateTab}
              />
            ) : undefined
          }
        >
          {win.body.launchUrl ? (
            <StudioFrame body={win.body} />
          ) : win.body.id === "settings" ? (
            <SettingsPanel
              wallpaper={wallpaper}
              onWallpaperChange={onWallpaperChange}
              theme={theme}
              onThemeChange={onThemeChange}
              taskbarAutoHide={taskbarAutoHide}
              onToggleTaskbarAutoHide={onToggleTaskbarAutoHide}
              taskbarAlignment={taskbarAlignment}
              onTaskbarAlignmentChange={onTaskbarAlignmentChange}
              taskbarShowClock={taskbarShowClock}
              onToggleTaskbarShowClock={onToggleTaskbarShowClock}
              onOpenAboutOS={onOpenAboutOS}
              onOpenOSUpdate={onOpenOSUpdate}
            />
          ) : win.body.id === "terminal" ? (
            <TerminalPanel
              sessionId={terminalSessionId}
              lines={terminalLines}
              onLinesChange={onTerminalLinesChange}
              cwd={terminalCwd}
              onCwdChange={onTerminalCwdChange}
            />
          ) : win.body.id === "browser" ? (
            <BrowserPanel
              tabs={browserTabs}
              activeTabId={activeBrowserTabId}
              onNavigate={onBrowserNavigate}
              onBack={onBrowserBack}
              onForward={onBrowserForward}
              onReload={onBrowserReload}
              onHome={onBrowserHome}
              onInstallApp={onInstallApp}
            />
          ) : (
            <StudioDetailCard body={win.body} variant="embedded" showHeader={false} />
          )}
        </WindowChrome>

        {!win.maximized &&
          RESIZE_HANDLES.map(({ dir, className, cursor }) => (
            <div
              key={dir}
              onMouseDown={(e) => handleResizeMouseDown(e, dir)}
              className={`absolute z-20 ${className} ${cursor} transition-colors hover:bg-sky-400/25`}
            />
          ))}
      </div>

      {createPortal(
        <div
          ref={overlayRef}
          className="fixed inset-0 hidden cursor-move"
          style={{ zIndex: 99999 }}
        />,
        document.body
      )}

      {previewRect &&
        createPortal(
          <div
            className="fixed rounded-lg border-2 border-sky-400/70 bg-sky-400/20"
            style={{
              left: previewRect.x,
              top: previewRect.y,
              width: previewRect.width,
              height: previewRect.height,
              zIndex: 99998,
            }}
          />,
          document.body
        )}
    </>
  );
}
