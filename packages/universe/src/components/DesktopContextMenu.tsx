import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrangeCorner,
  ARRANGE_CORNERS,
  ARRANGE_CORNER_LABELS,
  ArrangeLayout,
  ARRANGE_LAYOUTS,
  ARRANGE_LAYOUT_LABELS,
  ArrangeFit,
  ARRANGE_FITS,
  ARRANGE_FIT_LABELS,
} from "./TraditionalShell";

interface DesktopContextMenuProps {
  x: number;
  y: number;
  showDesktopIcons: boolean;
  onToggleShowDesktopIcons: () => void;
  autoArrange: boolean;
  alignToGrid: boolean;
  onToggleAutoArrange: () => void;
  onToggleAlignToGrid: () => void;
  arrangeCorner: ArrangeCorner;
  onArrangeCornerChange: (corner: ArrangeCorner) => void;
  arrangeLayout: ArrangeLayout;
  onArrangeLayoutChange: (layout: ArrangeLayout) => void;
  arrangeFit: ArrangeFit;
  onArrangeFitChange: (fit: ArrangeFit) => void;
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
   *  plain browser tab has no way to reach winget, so the menu item is omitted entirely there
   *  rather than shown disabled. */
  onInstallSoftware?: () => void;
  /** Count of currently-hidden apps — the menu item is omitted entirely when 0, since "Show 0
   *  hidden apps" would just be confusing dead weight. */
  hiddenCount: number;
  onShowHiddenApps: () => void;
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

/** A hover-opened flyout for a cluster of related items — "New", "View", "Install" below all used
 *  to be flat top-level entries, which made this menu read as a long undifferentiated list once
 *  "Show hidden apps" and the master show/hide-icons toggle joined it. Positioned relative to its
 *  own trigger row (both already live inside the SAME already-portaled fixed container from
 *  DesktopContextMenu below, so no second portal is needed here) and flips to the left edge when
 *  there isn't enough room on the right. */
function MenuSubmenu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [flipLeft, setFlipLeft] = useState(false);
  const [topOffset, setTopOffset] = useState(0);
  const itemRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  // The flyout sits a few px away from its trigger (`ml-1`/`mr-1`) with a real gap between the two
  // elements' rendered boxes — a straight or diagonal mouse path from the trigger to an item inside
  // the flyout crosses that gap, landing on neither for a moment. Closing on that exact frame (the
  // old behavior) meant the flyout could vanish mid-move, before the click on its item ever lands.
  // Deferring the close briefly, and cancelling it if the pointer re-enters (the trigger OR the
  // flyout — either resets this same timer), gives that crossing time to complete instead.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || !itemRef.current) return;
    const rect = itemRef.current.getBoundingClientRect();
    setFlipLeft(rect.right + MENU_WIDTH > window.innerWidth);
  }, [open]);

  // Flush-aligned with the trigger's own top by default, which runs the flyout past the bottom of
  // the viewport once the trigger sits low on screen — a right-click near the middle/bottom of the
  // desktop opening "Arrange from" (5 items) hits this easily. Measure the rendered flyout and shift
  // it upward just enough to fit, the same clamp DesktopContextMenu itself already applies below.
  useLayoutEffect(() => {
    if (!open) {
      setTopOffset(0);
      return;
    }
    if (!flyoutRef.current) return;
    const rect = flyoutRef.current.getBoundingClientRect();
    const overflow = rect.bottom - window.innerHeight + 8;
    if (overflow > 0) setTopOffset(-overflow);
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  function handleEnter() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpen(true);
  }

  function handleLeave() {
    closeTimerRef.current = setTimeout(() => setOpen(false), 300);
  }

  return (
    <div ref={itemRef} className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2.5 rounded-lg px-3 py-2 pl-[26px] text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          ref={flyoutRef}
          style={{ width: MENU_WIDTH, top: topOffset }}
          className={`absolute rounded-xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-1.5 shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)] ${
            flipLeft ? "right-full mr-1" : "left-full ml-1"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default function DesktopContextMenu({
  x,
  y,
  showDesktopIcons,
  onToggleShowDesktopIcons,
  autoArrange,
  alignToGrid,
  onToggleAutoArrange,
  onToggleAlignToGrid,
  arrangeCorner,
  onArrangeCornerChange,
  arrangeLayout,
  onArrangeLayoutChange,
  arrangeFit,
  onArrangeFitChange,
  onSortByName,
  onRefresh,
  onPersonalize,
  onCreateFolder,
  onCreateFile,
  onPaste,
  pasteDisabled,
  onOpenTerminal,
  onInstallApp,
  onInstallSoftware,
  hiddenCount,
  onShowHiddenApps,
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
  const top = Math.min(y, window.innerHeight - 280);

  // Portaled straight to <body> — this menu lives inside TraditionalShell, which (like
  // WindowChrome, see its own backdrop-filter note) ends up in a stacking context that caps any
  // z-index set from inside it below open <Window>s rendered as VeasnaShell's siblings, no matter
  // how high the number here is. Escaping to <body> is what actually fixes it, not a bigger number.
  return createPortal(
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left, top, width: MENU_WIDTH, zIndex: 9500 }}
      className="fixed rounded-xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-1.5 shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
    >
      <MenuSubmenu label="New">
        <MenuActionItem label="Folder" onClick={onCreateFolder} />
        <MenuActionItem label="Text File" onClick={onCreateFile} />
      </MenuSubmenu>
      <MenuDivider />
      <MenuActionItem label="Paste" onClick={onPaste} disabled={pasteDisabled} />
      <MenuDivider />
      <MenuActionItem label="Open in Terminal" onClick={onOpenTerminal} />
      <MenuSubmenu label="Install">
        <MenuActionItem label="Web App…" onClick={onInstallApp} />
        {onInstallSoftware && <MenuActionItem label="Software…" onClick={onInstallSoftware} />}
      </MenuSubmenu>
      {hiddenCount > 0 && <MenuActionItem label={`Show hidden apps (${hiddenCount})…`} onClick={onShowHiddenApps} />}
      <MenuDivider />
      <MenuSubmenu label="View">
        <MenuCheckboxItem label="Show desktop icons" checked={showDesktopIcons} onClick={onToggleShowDesktopIcons} />
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
        <MenuSubmenu label="Arrange from">
          {ARRANGE_CORNERS.map((corner) => (
            <MenuCheckboxItem
              key={corner}
              label={ARRANGE_CORNER_LABELS[corner]}
              checked={arrangeCorner === corner}
              onClick={() => onArrangeCornerChange(corner)}
            />
          ))}
        </MenuSubmenu>
        <MenuSubmenu label="Arrange as">
          {ARRANGE_LAYOUTS.map((layout) => (
            <MenuCheckboxItem
              key={layout}
              label={ARRANGE_LAYOUT_LABELS[layout]}
              checked={arrangeLayout === layout}
              onClick={() => onArrangeLayoutChange(layout)}
            />
          ))}
        </MenuSubmenu>
        <MenuSubmenu label="Arrange fit">
          {ARRANGE_FITS.map((fit) => (
            <MenuCheckboxItem
              key={fit}
              label={ARRANGE_FIT_LABELS[fit]}
              checked={arrangeFit === fit}
              onClick={() => onArrangeFitChange(fit)}
            />
          ))}
        </MenuSubmenu>
      </MenuSubmenu>
      <MenuDivider />
      <MenuActionItem label="Refresh" onClick={onRefresh} />
      <MenuActionItem label="Personalize…" onClick={onPersonalize} />
    </div>,
    document.body
  );
}
