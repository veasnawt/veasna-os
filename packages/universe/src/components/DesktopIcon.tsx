import React, { forwardRef, useEffect, useRef, useState } from "react";

export interface IconPosition {
  x: number;
  y: number;
}

interface DesktopIconProps {
  id: string;
  name: string;
  color: string;
  icon: React.ComponentType<{ size?: number }>;
  selected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onOpen: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** null = laid out by the flex grid (auto-arrange). Set = absolutely positioned (manual). */
  position: IconPosition | null;
  /** Live offset applied on top of `position` while this icon is part of an active drag. */
  previewOffset?: { dx: number; dy: number } | null;
  /** True while another selected item is being dragged over this (folder) icon. */
  dropHighlight?: boolean;
  onDragStart?: () => void;
  onDragMove?: (dx: number, dy: number, clientX: number, clientY: number) => void;
  onDragEnd?: (dx: number, dy: number, clientX: number, clientY: number) => void;
  renaming?: boolean;
  onRenameSubmit?: (name: string) => void;
  onRenameCancel?: () => void;
}

const DRAG_THRESHOLD = 4;

const DesktopIcon = forwardRef<HTMLButtonElement, DesktopIconProps>(function DesktopIcon(
  {
    name,
    color,
    icon: Icon,
    selected,
    onSelect,
    onOpen,
    onContextMenu,
    position,
    previewOffset,
    dropHighlight,
    onDragStart,
    onDragMove,
    onDragEnd,
    renaming,
    onRenameSubmit,
    onRenameCancel,
  },
  ref
) {
  const dragOrigin = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  function handleMouseDown(e: React.MouseEvent) {
    if (renaming || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragOrigin.current = { startX: e.clientX, startY: e.clientY, dragging: false };

    function handleMouseMove(ev: MouseEvent) {
      const origin = dragOrigin.current;
      if (!origin) return;
      const dx = ev.clientX - origin.startX;
      const dy = ev.clientY - origin.startY;
      if (!origin.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        origin.dragging = true;
        onDragStart?.();
      }
      if (origin.dragging) onDragMove?.(dx, dy, ev.clientX, ev.clientY);
    }

    function handleMouseUp(ev: MouseEvent) {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      const origin = dragOrigin.current;
      dragOrigin.current = null;
      if (origin?.dragging) {
        const dx = ev.clientX - origin.startX;
        const dy = ev.clientY - origin.startY;
        onDragEnd?.(dx, dy, ev.clientX, ev.clientY);
      }
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  const offset = previewOffset;
  const style: React.CSSProperties | undefined = position
    ? {
        position: "absolute",
        left: position.x,
        top: position.y,
        transform: offset ? `translate(${offset.dx}px, ${offset.dy}px)` : undefined,
        zIndex: offset ? 10 : undefined,
      }
    : offset
      ? { transform: `translate(${offset.dx}px, ${offset.dy}px)`, position: "relative", zIndex: 10 }
      : undefined;

  return (
    <button
      ref={ref}
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        e.stopPropagation();
        if (!renaming) onSelect(e);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!renaming) onOpen();
      }}
      onContextMenu={onContextMenu}
      style={style}
      className={`flex w-24 flex-col items-center gap-1.5 rounded p-2 text-center transition ${
        !renaming ? "cursor-grab active:cursor-grabbing" : ""
      } ${
        dropHighlight
          ? "bg-sky-400/30 outline outline-2 outline-sky-300"
          : selected
            ? "bg-sky-500/25 outline outline-1 outline-sky-400/50"
            : "hover:bg-white/[0.06]"
      }`}
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-xl shadow-[0_4px_16px_-2px_rgba(0,0,0,0.65)] backdrop-blur-md ring-1 ring-white/15"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 30%, rgba(6, 8, 16, 0.72))`,
          color,
          border: `1px solid ${color}55`,
        }}
      >
        <Icon size={24} />
      </span>
      {renaming ? (
        <input
          ref={inputRef}
          defaultValue={name}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") onRenameCancel?.();
          }}
          onBlur={(e) => onRenameSubmit?.(e.target.value)}
          className="w-full rounded bg-[var(--os-surface-strong)] px-1 py-0.5 text-center text-[11px] font-medium text-[var(--os-text)] outline outline-1 outline-[var(--os-accent-border)]"
        />
      ) : (
        <span className="rounded-md bg-black/40 px-1.5 py-0.5 text-[11px] font-medium text-white leading-tight backdrop-blur-sm [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
          {name}
        </span>
      )}
    </button>
  );
});

export default DesktopIcon;
