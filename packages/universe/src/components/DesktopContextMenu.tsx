import React, { useEffect, useRef } from "react";

interface DesktopContextMenuProps {
  x: number;
  y: number;
  autoArrange: boolean;
  alignToGrid: boolean;
  onToggleAutoArrange: () => void;
  onToggleAlignToGrid: () => void;
  onSortByName: () => void;
  onRefresh: () => void;
  onPersonalize: () => void;
  onCreateFolder: () => void;
  onCreateFile: () => void;
  onPaste: () => void;
  pasteDisabled: boolean;
  onOpenTerminal: () => void;
  onInstallApp: () => void;
  /** Only passed inside the packaged Electron desktop app (see runtime.ts's getAppsBridge) — a
   *  plain browser tab has no way to launch a real native executable, so the menu item is omitted
   *  entirely there rather than shown disabled. */
  onAddLocalApp?: () => void;
  onClose: () => void;
}

const MENU_WIDTH = 216;

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2 6.2 L4.8 9 L10 3"
        stroke="var(--os-accent-text)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MenuCheckboxItem({
  label,
  checked,
  hint,
  onClick,
}: {
  label: string;
  checked: boolean;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={hint}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{checked && <CheckIcon />}</span>
      {label}
    </button>
  );
}

function MenuActionItem({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 pl-[26px] text-left text-xs font-medium transition ${
        disabled
          ? "cursor-default text-[var(--os-text-muted)] opacity-50"
          : "text-[var(--os-text)] hover:bg-[var(--os-border-strong)]"
      }`}
    >
      {label}
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 h-px bg-[var(--os-border)]" />;
}

export default function DesktopContextMenu({
  x,
  y,
  autoArrange,
  alignToGrid,
  onToggleAutoArrange,
  onToggleAlignToGrid,
  onSortByName,
  onRefresh,
  onPersonalize,
  onCreateFolder,
  onCreateFile,
  onPaste,
  pasteDisabled,
  onOpenTerminal,
  onInstallApp,
  onAddLocalApp,
  onClose,
}: DesktopContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Capture phase — desktop icons' own mousedown handlers call stopPropagation() (for drag
    // support), which would otherwise silently stop a bubble-phase listener here from ever seeing a
    // click on one. Capture fires before any of those handlers get a chance to stop anything.
    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(y, window.innerHeight - 320);

  return (
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left, top, width: MENU_WIDTH, zIndex: 9500 }}
      className="fixed rounded-xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-1.5 shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
    >
      <MenuActionItem label="New Folder" onClick={onCreateFolder} />
      <MenuActionItem label="New Text File" onClick={onCreateFile} />
      <MenuDivider />
      <MenuActionItem label="Paste" onClick={onPaste} disabled={pasteDisabled} />
      <MenuDivider />
      <MenuActionItem label="Open in Terminal" onClick={onOpenTerminal} />
      <MenuActionItem label="Install Web App…" onClick={onInstallApp} />
      {onAddLocalApp && <MenuActionItem label="Add Local App…" onClick={onAddLocalApp} />}
      <MenuDivider />
      <MenuCheckboxItem label="Auto arrange icons" checked={autoArrange} onClick={onToggleAutoArrange} />
      <MenuCheckboxItem
        label="Align icons to grid"
        checked={alignToGrid}
        hint={autoArrange ? "Applies once auto arrange is off" : undefined}
        onClick={onToggleAlignToGrid}
      />
      <MenuDivider />
      <MenuActionItem label="Sort icons by name" onClick={onSortByName} />
      <MenuDivider />
      <MenuActionItem label="Refresh" onClick={onRefresh} />
      <MenuActionItem label="Personalize…" onClick={onPersonalize} />
    </div>
  );
}
