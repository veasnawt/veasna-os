import React from "react";
import type { ShellMode } from "../types";

interface ModeToggleProps {
  mode: ShellMode;
  onChange: (mode: ShellMode) => void;
}

/** Lives inline inside `Taskbar.tsx`'s own right-side group (next to the clock) — the taskbar is
 *  now always rendered, so this never needs a separate floating fallback for when the taskbar isn't
 *  there (see the git history around 2026-08-08 if that assumption ever needs revisiting). */
export default function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-[var(--os-border)] bg-[var(--os-header)] p-0.5">
      <button
        onClick={() => onChange("3d")}
        className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] transition-all ${
          mode === "3d"
            ? "bg-[var(--os-accent-soft)] text-[var(--os-accent-text)]"
            : "text-[var(--os-text-muted)] hover:text-[var(--os-text)]"
        }`}
        title="3D Living Universe"
        aria-label="Universe (3D) view"
      >
        🌌
      </button>
      <button
        onClick={() => onChange("list")}
        className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] transition-all ${
          mode === "list"
            ? "bg-[var(--os-accent-soft)] text-[var(--os-accent-text)]"
            : "text-[var(--os-text-muted)] hover:text-[var(--os-text)]"
        }`}
        title="Desktop view"
        aria-label="Desktop view"
      >
        🖥️
      </button>
    </div>
  );
}
