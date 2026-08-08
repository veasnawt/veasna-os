import React from "react";
import type { ShellMode } from "../types";

interface ModeToggleProps {
  mode: ShellMode;
  onChange: (mode: ShellMode) => void;
}

export default function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div
      className="pointer-events-auto fixed top-6 right-6 sm:top-8 sm:right-8 flex items-center gap-1 rounded-full border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-1 backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)] shadow-lg"
      style={{ zIndex: 9000 }}
    >
      <button
        onClick={() => onChange("3d")}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ${
          mode === "3d"
            ? "bg-[var(--os-accent-soft)] text-[var(--os-accent-text)]"
            : "text-[var(--os-text-muted)] hover:text-[var(--os-text)]"
        }`}
        title="3D Living Universe"
      >
        🌌 <span className="hidden sm:inline">Universe</span>
      </button>
      <button
        onClick={() => onChange("list")}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ${
          mode === "list"
            ? "bg-[var(--os-accent-soft)] text-[var(--os-accent-text)]"
            : "text-[var(--os-text-muted)] hover:text-[var(--os-text)]"
        }`}
        title="Traditional list view"
      >
        ☰ <span className="hidden sm:inline">List</span>
      </button>
    </div>
  );
}
