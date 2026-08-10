import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface IconContextMenuProps {
  x: number;
  y: number;
  count: number;
  onCut: () => void;
  onCopy: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
  /** Only passed when exactly one FILE (not folder) is selected — downloads it to the real OS. */
  onDownload?: () => void;
  /** Only passed for a file whose default open action ISN'T the plain-text editor (currently just
   *  .html/.htm, which open in the Browser studio instead) — the way to reach its actual source. */
  onEdit?: () => void;
  /** Only passed for an installed web app — not a real file, so it gets a completely different
   *  (much shorter) menu instead of Cut/Copy/Rename/Delete, which don't apply to it at all. */
  onUninstall?: () => void;
  /** Only passed when exactly one item (file, folder, or installed web app) is selected — opens the
   *  Properties window for it. */
  onProperties?: () => void;
  /** Only passed alongside `onUninstall` (an installed web app) — removes just its desktop icon,
   *  not the app itself (see PinContextMenu.tsx for the studio/filemanager equivalent). */
  onHide?: () => void;
  /** Only passed when exactly one item is selected — pinning a multi-selection at once doesn't
   *  have an obvious meaning in this UI, unlike Cut/Copy/Delete which apply per-item naturally. */
  pinned?: boolean;
  onTogglePin?: () => void;
}

const MENU_WIDTH = 170;

function MenuDivider() {
  return <div className="my-1 h-px bg-[var(--os-border)]" />;
}

export default function IconContextMenu({
  x,
  y,
  count,
  onCut,
  onCopy,
  onRename,
  onDelete,
  onClose,
  onDownload,
  onEdit,
  onUninstall,
  onProperties,
  onHide,
  pinned,
  onTogglePin,
}: IconContextMenuProps) {
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
  const top = Math.min(y, window.innerHeight - 180);

  // Portaled to <body> — same stacking-context fix as DesktopContextMenu.tsx, needed for the same
  // reason (lives inside TraditionalShell, which caps any z-index set from inside it below open
  // <Window>s rendered as VeasnaShell's siblings).
  if (onUninstall) {
    return createPortal(
      <div
        ref={menuRef}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
        style={{ left, top, width: MENU_WIDTH, zIndex: 9500 }}
        className="fixed rounded-xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-1.5 shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
      >
        {onTogglePin && (
          <button
            onClick={onTogglePin}
            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
          >
            {pinned ? "Unpin from taskbar" : "Pin to taskbar"}
          </button>
        )}
        {onHide && (
          <button
            onClick={onHide}
            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
          >
            Hide from Desktop
          </button>
        )}
        <button
          onClick={onUninstall}
          className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-400 transition hover:bg-[var(--os-border-strong)]"
        >
          Uninstall
        </button>
        {onProperties && (
          <>
            <MenuDivider />
            <button
              onClick={onProperties}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
            >
              Properties
            </button>
          </>
        )}
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left, top, width: MENU_WIDTH, zIndex: 9500 }}
      className="fixed rounded-xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-1.5 shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
    >
      {count === 1 && onTogglePin && (
        <>
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
          <MenuDivider />
        </>
      )}
      <button
        onClick={onCut}
        className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
      >
        Cut
      </button>
      <button
        onClick={onCopy}
        className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
      >
        Copy
      </button>
      <MenuDivider />
      {count === 1 && (
        <button
          onClick={onRename}
          className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
        >
          Rename
        </button>
      )}
      {count === 1 && onEdit && (
        <button
          onClick={onEdit}
          className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
        >
          Edit
        </button>
      )}
      {count === 1 && onDownload && (
        <button
          onClick={onDownload}
          className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
        >
          Download to computer
        </button>
      )}
      <button
        onClick={onDelete}
        className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-400 transition hover:bg-[var(--os-border-strong)]"
      >
        {count > 1 ? `Delete ${count} items` : "Delete"}
      </button>
      {count === 1 && onProperties && (
        <>
          <MenuDivider />
          <button
            onClick={onProperties}
            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
          >
            Properties
          </button>
        </>
      )}
    </div>,
    document.body
  );
}
