import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface TaskbarContextMenuProps {
  x: number;
  y: number;
  onOpenSettings: () => void;
  onClose: () => void;
}

const MENU_WIDTH = 190;

export default function TaskbarContextMenu({ x, y, onOpenSettings, onClose }: TaskbarContextMenuProps) {
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

  // Portaled to <body> — Taskbar's own root is a positioned (`relative z-40`) element, which
  // establishes a stacking context that caps this menu's z-index below open <Window>s once enough
  // of them have been focused to climb past z-40 (same underlying issue as DesktopContextMenu.tsx).
  return createPortal(
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left, top, width: MENU_WIDTH, zIndex: 9500 }}
      className="fixed rounded-xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-1.5 shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
    >
      <button
        onClick={onOpenSettings}
        className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
      >
        Taskbar settings
      </button>
    </div>,
    document.body
  );
}
