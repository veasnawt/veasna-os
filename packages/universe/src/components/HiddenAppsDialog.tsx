import React from "react";
import { createPortal } from "react-dom";

export interface HiddenAppEntry {
  id: string;
  name: string;
  color: string;
  icon: React.ComponentType<{ size?: number }>;
}

interface HiddenAppsDialogProps {
  entries: HiddenAppEntry[];
  onRestore: (id: string) => void;
  onClose: () => void;
}

/** Lists everything currently hidden from the desktop (see TraditionalShell.tsx's hideEntry/
 *  HIDDEN_APPS_KEY) with a one-click way back — same modal shell as InstallAppDialog.tsx. */
export default function HiddenAppsDialog({ entries, onRestore, onClose }: HiddenAppsDialogProps) {
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ zIndex: 99998 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-[380px] overflow-hidden rounded-2xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--os-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--os-text)]">Hidden Apps</h2>
          <p className="mt-0.5 text-[11px] text-[var(--os-text-muted)]">
            Restore an app to bring its icon back to the desktop.
          </p>
        </div>
        <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto px-2 py-2">
          {entries.length === 0 ? (
            <div className="px-2 py-4 text-center text-[11px] text-[var(--os-text-muted)]">Nothing hidden right now.</div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[var(--os-border-strong)]">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${entry.color}22`, color: entry.color }}
                >
                  <entry.icon size={14} />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--os-text)]">{entry.name}</span>
                <button
                  onClick={() => onRestore(entry.id)}
                  className="shrink-0 rounded-full bg-[var(--os-accent-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--os-accent-text)] transition hover:opacity-90"
                >
                  Restore
                </button>
              </div>
            ))
          )}
        </div>
        <div className="flex justify-end border-t border-[var(--os-border)] px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-1.5 text-xs font-semibold text-[var(--os-text-muted)] transition hover:bg-[var(--os-border-strong)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
