"use client";

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OpenWindow, TaskbarAlignment, WindowRect } from "../types";
import { ThemeMode } from "../utils/theme";
import WindowChrome from "./WindowChrome";
import StudioDetailCard from "./StudioDetailCard";
import SettingsPanel from "./SettingsPanel";

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
        >
          {win.body.launchUrl ? (
            <iframe
              src={win.body.launchUrl}
              title={win.body.name}
              className="h-full w-full border-0 bg-white"
            />
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
