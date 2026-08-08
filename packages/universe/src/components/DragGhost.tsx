import React from "react";
import { createPortal } from "react-dom";

interface DragGhostProps {
  x: number;
  y: number;
  label: string;
  color: string;
  icon: React.ComponentType<{ size?: number }>;
  /** Shown as a small badge when dragging more than one item at once. */
  count?: number;
}

/** Follows the cursor during a drag, portaled straight to `document.body` at a z-index above every
 *  window (windows themselves are also portaled there, per the stacking-context notes elsewhere in
 *  this codebase — anything meant to stay visible "above everything" during a drag has to live in
 *  that same top-level portal, a same-stacking-context z-index alone can't reach across it). */
export default function DragGhost({ x, y, label, color, icon: Icon, count }: DragGhostProps) {
  return createPortal(
    // The outer div is a zero-size anchor pinned exactly at the cursor (`left`/`top` = raw
    // clientX/clientY, no offset) — the icon badge is then centered on that anchor via its own
    // `translate(-50%, -50%)`, so the cursor visually pierces the badge's center like a real OS
    // drag ghost, instead of trailing off to one side. The label is anchored the same way, just
    // pushed down below the badge, so it stays centered under it as the ghost moves.
    <div className="pointer-events-none fixed" style={{ left: x, top: y, zIndex: 99999 }}>
      <span
        className="absolute left-0 top-0 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl shadow-[0_10px_28px_-4px_rgba(0,0,0,0.8)] ring-1 ring-white/20"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 38%, rgba(6, 8, 16, 0.85))`,
          color,
          border: `1px solid ${color}66`,
        }}
      >
        <Icon size={24} />
        {count !== undefined && count > 1 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-bold text-white ring-2 ring-black/40">
            {count}
          </span>
        )}
      </span>
      <span className="absolute left-0 top-8 max-w-[120px] -translate-x-1/2 truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
        {label}
      </span>
    </div>,
    document.body
  );
}
