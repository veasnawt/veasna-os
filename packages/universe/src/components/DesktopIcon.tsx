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
  /** When set (image files only), rendered instead of `icon` — a real thumbnail beats a generic glyph. */
  thumbnailUrl?: string;
  selected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onOpen: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** null = laid out by the flex grid (auto-arrange). Set = absolutely positioned (manual). */
  position: IconPosition | null;
  /** True while this icon is the (possibly multi-select) source of an active drag — the icon stays
   *  put and dims; the actual cursor-following visual is a separate portaled `DragGhost` the parent
   *  renders above every window, since this icon's own z-index can't escape its stacking context. */
  isDragging?: boolean;
  /** True while another selected item is being dragged over this (folder) icon. */
  dropHighlight?: boolean;
  /** True while this item is the pending target of a Cut (Ctrl+X) — dimmed until pasted or cancelled. */
  isCut?: boolean;
  onDragStart?: () => void;
  onDragMove?: (dx: number, dy: number, clientX: number, clientY: number) => void;
  onDragEnd?: (dx: number, dy: number, clientX: number, clientY: number) => void;
  renaming?: boolean;
  onRenameSubmit?: (name: string) => void;
  onRenameCancel?: () => void;
  /** Click-to-rename (like Explorer/Finder): clicking the NAME LABEL specifically — not the icon
   *  glyph — on an already-selected icon, with a deliberate pause since the click that selected it
   *  (long enough to not read as a double-click), fires immediately. */
  onRequestRename?: () => void;
}

const DRAG_THRESHOLD = 4;
// Must clear the browser/OS's own double-click threshold (typically ~300-500ms) so a genuine fast
// double-click (open) never gets misread as two separate rename-triggering clicks.
const RENAME_MIN_GAP = 450;

const DesktopIcon = forwardRef<HTMLButtonElement, DesktopIconProps>(function DesktopIcon(
  {
    name,
    color,
    icon: Icon,
    thumbnailUrl,
    selected,
    onSelect,
    onOpen,
    onContextMenu,
    position,
    isDragging,
    dropHighlight,
    isCut,
    onDragStart,
    onDragMove,
    onDragEnd,
    renaming,
    onRenameSubmit,
    onRenameCancel,
    onRequestRename,
  },
  ref
) {
  const dragOrigin = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Time of the last label click, whether or not it triggered anything — compared against on the
  // NEXT label click to tell "a deliberate second click" (long gap) from "the second half of a fast
  // double-click" (short gap), without waiting around afterward to find out which one it was.
  const lastLabelClickRef = useRef<number>(0);

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

  const style: React.CSSProperties | undefined = position
    ? { position: "absolute", left: position.x, top: position.y }
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
        lastLabelClickRef.current = 0;
        if (!renaming) onOpen();
      }}
      onContextMenu={onContextMenu}
      style={style}
      className={`flex w-24 flex-col items-center gap-1.5 rounded p-2 text-center transition ${
        !renaming ? "cursor-grab active:cursor-grabbing" : ""
      } ${isCut || isDragging ? "opacity-40" : ""} ${
        dropHighlight
          ? "bg-sky-400/30 outline outline-2 outline-sky-300"
          : selected
            ? "bg-sky-500/25 outline outline-1 outline-sky-400/50"
            : "hover:bg-white/[0.06]"
      }`}
    >
      <span
        className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl shadow-[0_4px_16px_-2px_rgba(0,0,0,0.65)] backdrop-blur-md ring-1 ring-white/15"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 30%, rgba(6, 8, 16, 0.72))`,
          color,
          border: `1px solid ${color}55`,
        }}
      >
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary sandboxed local files, not a next/image remote-origin case
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon size={24} />
        )}
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
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (e.ctrlKey || e.metaKey || e.shiftKey) {
              onSelect(e);
              return;
            }
            const now = Date.now();
            const gap = now - lastLabelClickRef.current;
            lastLabelClickRef.current = now;
            // Already selected AND this click came a deliberate beat after the one that selected it
            // (or after the last rename attempt) — fires the rename right now, no extra wait. A short
            // gap instead means this is the second half of a fast double-click, so it's left alone:
            // no re-selecting (already selected), and the browser's own upcoming `dblclick` opens it.
            if (selected && gap > RENAME_MIN_GAP) {
              onRequestRename?.();
            } else if (!selected) {
              onSelect(e);
            }
          }}
          className="line-clamp-2 w-full break-words text-[11px] font-medium leading-tight text-white [paint-order:stroke_fill] [-webkit-text-stroke:3px_rgba(0,0,0,0.75)]"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
          title={name}
        >
          {name}
        </span>
      )}
    </button>
  );
});

export default DesktopIcon;
