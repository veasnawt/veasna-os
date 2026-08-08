import React from "react";

// Hand-drawn to match pixel-for-pixel — Unicode glyphs (─ □ ✕) render at
// inconsistent sizes/baselines across fonts, which is why the old buttons looked misaligned.
function MinimizeGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <line x1="1.5" y1="8" x2="8.5" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function MaximizeGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="1.5" y="1.5" width="7" height="7" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function RestoreGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="2.9" y="1" width="6.1" height="6.1" rx="0.5" stroke="currentColor" strokeWidth="1.1" />
      <rect x="1" y="2.9" width="6.1" height="6.1" rx="0.5" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <line x1="1.3" y1="1.3" x2="8.7" y2="8.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="8.7" y1="1.3" x2="1.3" y2="8.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

interface WindowChromeProps {
  title: string;
  icon: React.ComponentType<{ size?: number }>;
  color: string;
  maximized: boolean;
  /** Omit to hide the minimize button — used by windows with no taskbar entry to minimize to. */
  onMinimize?: () => void;
  onMaximizeToggle: () => void;
  onClose: () => void;
  onFocus?: () => void;
  onTitleBarMouseDown?: (e: React.MouseEvent) => void;
  className?: string;
  children: React.ReactNode;
}

export default function WindowChrome({
  title,
  icon: Icon,
  color,
  maximized,
  onMinimize,
  onMaximizeToggle,
  onClose,
  onFocus,
  onTitleBarMouseDown,
  className = "w-full max-w-xl",
  children,
}: WindowChromeProps) {
  return (
    <div
      onMouseDown={onFocus}
      className={`flex h-full flex-col rounded-lg border border-[var(--os-border)] bg-[var(--os-surface)] text-[var(--os-text)] shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)] overflow-hidden ${className}`}
    >
      <div
        onMouseDown={onTitleBarMouseDown}
        onDoubleClick={onMaximizeToggle}
        className="flex shrink-0 select-none items-center justify-between border-b border-[var(--os-border)] bg-[var(--os-header)] px-3 py-2"
      >
        <div className="pointer-events-none flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center" style={{ color }}>
            <Icon size={14} />
          </span>
          <span className="text-xs font-semibold text-[var(--os-text)]">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          {onMinimize && (
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={onMinimize}
              aria-label="Minimize"
              className="flex h-6 w-8 items-center justify-center rounded text-[var(--os-text-muted)] transition hover:bg-[var(--os-border-strong)] hover:text-[var(--os-text)]"
            >
              <MinimizeGlyph />
            </button>
          )}
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onMaximizeToggle}
            aria-label={maximized ? "Restore" : "Maximize"}
            className="flex h-6 w-8 items-center justify-center rounded text-[var(--os-text-muted)] transition hover:bg-[var(--os-border-strong)] hover:text-[var(--os-text)]"
          >
            {maximized ? <RestoreGlyph /> : <MaximizeGlyph />}
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
            aria-label="Close"
            className="flex h-6 w-8 items-center justify-center rounded text-[var(--os-text-muted)] transition hover:bg-red-500 hover:text-white"
          >
            <CloseGlyph />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
