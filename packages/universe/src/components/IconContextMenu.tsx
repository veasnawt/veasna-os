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
}

const MENU_WIDTH = 170;

function MenuDivider() {
  return <div className="my-1 h-px bg-[var(--os-border)]" />;
}

export default function IconContextMenu({ x, y, count, onCut, onCopy, onRename, onDelete, onClose }: IconContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(y, window.innerHeight - 180);

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
      <button
        onClick={onDelete}
        className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-400 transition hover:bg-[var(--os-border-strong)]"
      >
        {count > 1 ? `Delete ${count} items` : "Delete"}
      </button>
    </div>
  );
}
