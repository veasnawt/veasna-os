"use client";

import React, { useRef, useState } from "react";
import WindowChrome from "./WindowChrome";

export interface FloatingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FloatingWindowProps {
  title: string;
  icon: React.ComponentType<{ size?: number }>;
  color: string;
  cascadeIndex: number;
  defaultWidth: number;
  defaultHeight: number;
  minWidth?: number;
  minHeight?: number;
  /** Pixels of viewport bottom to stay clear of (0 when the taskbar isn't currently occupying space, e.g. auto-hidden). */
  taskbarReserve: number;
  onClose: () => void;
  onFocus: () => void;
  /** Omit to hide the minimize button. */
  onMinimize?: () => void;
  children: React.ReactNode;
}

const MIN_WIDTH = 320;
const MIN_HEIGHT = 220;
const DRAG_THRESHOLD = 4;

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

function initialRect(cascadeIndex: number, width: number, height: number): FloatingRect {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const offset = (cascadeIndex % 6) * 28;
  return {
    x: Math.max(16, (vw - width) / 2 + offset),
    y: Math.max(16, (vh - height) / 2 + offset),
    width,
    height,
  };
}

export default function FloatingWindow({
  title,
  icon,
  color,
  cascadeIndex,
  defaultWidth,
  defaultHeight,
  minWidth = MIN_WIDTH,
  minHeight = MIN_HEIGHT,
  taskbarReserve,
  onClose,
  onFocus,
  onMinimize,
  children,
}: FloatingWindowProps) {
  const [rect, setRect] = useState<FloatingRect>(() => initialRect(cascadeIndex, defaultWidth, defaultHeight));
  const [maximized, setMaximized] = useState(false);
  const preMaximizeRectRef = useRef<FloatingRect | null>(null);

  function handleTitleBarMouseDown(e: React.MouseEvent) {
    if (e.button !== 0 || maximized) return;
    onFocus();
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = rect;
    let dragging = false;

    function handleMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        dragging = true;
        document.body.style.userSelect = "none";
      }
      if (dragging) {
        const vw = window.innerWidth;
        const vh = window.innerHeight - taskbarReserve;
        const x = Math.min(Math.max(startRect.x + dx, 0), Math.max(0, vw - startRect.width));
        const y = Math.min(Math.max(startRect.y + dy, 0), Math.max(0, vh - startRect.height));
        setRect({ ...startRect, x, y });
      }
    }
    function handleUp() {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  function handleResizeMouseDown(e: React.MouseEvent, dir: ResizeDir) {
    e.stopPropagation();
    if (e.button !== 0 || maximized) return;
    onFocus();
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = rect;

    function compute(dx: number, dy: number): FloatingRect {
      let { x, y, width, height } = startRect;
      if (dir.includes("e")) width = startRect.width + dx;
      if (dir.includes("s")) height = startRect.height + dy;
      if (dir.includes("w")) {
        width = startRect.width - dx;
        x = startRect.x + dx;
      }
      if (dir.includes("n")) {
        height = startRect.height - dy;
        y = startRect.y + dy;
      }
      if (width < minWidth) {
        if (dir.includes("w")) x = startRect.x + startRect.width - minWidth;
        width = minWidth;
      }
      if (height < minHeight) {
        if (dir.includes("n")) y = startRect.y + startRect.height - minHeight;
        height = minHeight;
      }
      return { x, y, width, height };
    }

    function handleMove(ev: MouseEvent) {
      document.body.style.userSelect = "none";
      setRect(compute(ev.clientX - startX, ev.clientY - startY));
    }
    function handleUp() {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  function handleMaximizeToggle() {
    if (maximized) {
      setRect(preMaximizeRectRef.current ?? rect);
      setMaximized(false);
    } else {
      preMaximizeRectRef.current = rect;
      setRect({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight - taskbarReserve });
      setMaximized(true);
    }
  }

  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
        onFocus();
      }}
      style={{
        position: "fixed",
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex: 200 + cascadeIndex,
      }}
    >
      <div className="relative h-full w-full">
        <WindowChrome
          title={title}
          icon={icon}
          color={color}
          maximized={maximized}
          onMaximizeToggle={handleMaximizeToggle}
          onMinimize={onMinimize}
          onClose={onClose}
          onFocus={onFocus}
          onTitleBarMouseDown={handleTitleBarMouseDown}
          className="h-full w-full"
        >
          {children}
        </WindowChrome>

        {!maximized &&
          RESIZE_HANDLES.map(({ dir, className, cursor }) => (
            <div
              key={dir}
              onMouseDown={(e) => handleResizeMouseDown(e, dir)}
              className={`absolute z-20 ${className} ${cursor} transition-colors hover:bg-sky-400/25`}
            />
          ))}
      </div>
    </div>
  );
}
