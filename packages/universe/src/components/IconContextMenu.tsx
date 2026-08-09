import React, { useEffect, useRef } from "react";

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

  if (onUninstall) {
    return (
      <div
        ref={menuRef}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
        style={{ left, top, width: MENU_WIDTH, zIndex: 9500 }}
        className="fixed rounded-xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-1.5 shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
      >
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
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left, top, width: MENU_WIDTH, zIndex: 9500 }}
      className="fixed rounded-xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-1.5 shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
    >
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
    </div>
  );
}
