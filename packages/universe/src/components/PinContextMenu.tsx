import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface PinContextMenuProps {
  x: number;
  y: number;
  pinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
  /** Only passed when this menu was opened from a DESKTOP icon (TraditionalShell.tsx) — Taskbar.tsx
   *  reuses this same component for its own pinned/running buttons, where "hide from desktop"
   *  wouldn't make sense (it's not a desktop icon at all at that point). */
  onHide?: () => void;
}

const MENU_WIDTH = 190;

export default function PinContextMenu({ x, y, pinned, onTogglePin, onClose, onHide }: PinContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Capture phase — see the matching comment in DesktopContextMenu.tsx for why.
    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(y, window.innerHeight - 60);

  // Portaled to <body> — same stacking-context fix as TaskbarContextMenu.tsx (this menu lives
  // inside Taskbar too, subject to the identical cap once a window's z-index climbs past
  // Taskbar's own `relative z-40`).
  return createPortal(
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left, top, width: MENU_WIDTH, zIndex: 9500 }}
      className="fixed rounded-xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-1.5 shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
    >
      <button
        onClick={onTogglePin}
        className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
      >
        {pinned ? "Unpin from taskbar" : "Pin to taskbar"}
      </button>
      {onHide && (
        <button
          onClick={onHide}
          className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
        >
          Hide from Desktop
        </button>
      )}
    </div>,
    document.body
  );
}
