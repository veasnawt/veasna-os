import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface BrowserTabContextMenuProps {
  x: number;
  y: number;
  canClose: boolean;
  hasOtherTabs: boolean;
  hasTabsToRight: boolean;
  onNewTab: () => void;
  onDuplicate: () => void;
  onReload: () => void;
  onCloseTab: () => void;
  onCloseOtherTabs: () => void;
  onCloseTabsToRight: () => void;
  onDismiss: () => void;
}

const MENU_WIDTH = 200;

function MenuItem({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/** Right-click menu for a single tab in the Browser studio's title-bar tab strip — same
 *  click-outside/Escape-to-dismiss pattern as PinContextMenu/DesktopContextMenu, kept as its own
 *  file rather than folded into Window.tsx since it's a real, independently reusable piece of UI. */
export default function BrowserTabContextMenu({
  x,
  y,
  canClose,
  hasOtherTabs,
  hasTabsToRight,
  onNewTab,
  onDuplicate,
  onReload,
  onCloseTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onDismiss,
}: BrowserTabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onDismiss();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    // Capture phase — see the matching comment in DesktopContextMenu.tsx for why.
    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss]);

  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(y, window.innerHeight - 260);

  function run(action: () => void) {
    action();
    onDismiss();
  }

  return createPortal(
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left, top, width: MENU_WIDTH, zIndex: 100000 }}
      className="fixed rounded-xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-1.5 shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
    >
      <MenuItem onClick={() => run(onNewTab)}>New Tab</MenuItem>
      <MenuItem onClick={() => run(onDuplicate)}>Duplicate Tab</MenuItem>
      <MenuItem onClick={() => run(onReload)}>Reload</MenuItem>
      <div className="my-1 h-px bg-[var(--os-border)]" />
      <MenuItem onClick={() => run(onCloseTab)} disabled={!canClose}>
        Close Tab
      </MenuItem>
      <MenuItem onClick={() => run(onCloseOtherTabs)} disabled={!hasOtherTabs}>
        Close Other Tabs
      </MenuItem>
      <MenuItem onClick={() => run(onCloseTabsToRight)} disabled={!hasTabsToRight}>
        Close Tabs to the Right
      </MenuItem>
    </div>,
    document.body
  );
}
