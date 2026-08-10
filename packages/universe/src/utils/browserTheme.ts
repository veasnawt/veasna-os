import React from "react";

export type BrowserThemeMode = "dark" | "light";
export type BrowserAccent = "sky" | "violet" | "rose" | "emerald" | "amber";

export interface BrowserThemeState {
  mode: BrowserThemeMode;
  accent: BrowserAccent;
}

const STORAGE_KEY = "veasna-os:browser-theme";

const DEFAULT_STATE: BrowserThemeState = { mode: "dark", accent: "sky" };

export const ACCENTS: Record<BrowserAccent, { label: string; hex: string; soft: string; border: string }> = {
  sky: { label: "Sky", hex: "#38bdf8", soft: "rgba(56,189,248,0.2)", border: "rgba(56,189,248,0.5)" },
  violet: { label: "Violet", hex: "#a78bfa", soft: "rgba(167,139,250,0.2)", border: "rgba(167,139,250,0.5)" },
  rose: { label: "Rose", hex: "#fb7185", soft: "rgba(251,113,133,0.2)", border: "rgba(251,113,133,0.5)" },
  emerald: { label: "Emerald", hex: "#34d399", soft: "rgba(52,211,153,0.2)", border: "rgba(52,211,153,0.5)" },
  amber: { label: "Amber", hex: "#fbbf24", soft: "rgba(251,191,36,0.2)", border: "rgba(251,191,36,0.5)" },
};

export function loadBrowserTheme(): BrowserThemeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return {
      mode: parsed.mode === "light" ? "light" : "dark",
      accent: parsed.accent in ACCENTS ? parsed.accent : "sky",
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveBrowserTheme(state: BrowserThemeState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** CSS custom properties scoped to the Browser studio's own root — deliberately separate from the
 *  OS-wide `--os-*` theme tokens (SettingsPanel.tsx) rather than reusing them: a real browser's
 *  toolbar/tab theme is its own independent setting from the OS's overall dark/light/glass mode,
 *  same as Chrome or Edge letting you pick a browser theme regardless of Windows' own theme.
 *  Precomputed rgba strings (soft/border) rather than relying on Tailwind's opacity-modifier
 *  syntax on an arbitrary `var(--x)` — that only works for Tailwind's own color tokens (which it
 *  can expand to `rgb(r g b / <alpha>)` at build time), not an opaque CSS variable reference whose
 *  channels it can't see. */
export function browserThemeVars(state: BrowserThemeState): React.CSSProperties {
  const accent = ACCENTS[state.accent];
  const base =
    state.mode === "light"
      ? {
          "--browser-bg": "#f8fafc",
          "--browser-surface": "#ffffff",
          "--browser-border": "rgba(15,23,42,0.12)",
          "--browser-text": "#0f172a",
          "--browser-text-muted": "#64748b",
          "--browser-hover": "rgba(15,23,42,0.06)",
          "--browser-input-bg": "rgba(15,23,42,0.04)",
        }
      : {
          "--browser-bg": "#0b0e14",
          "--browser-surface": "#151a24",
          "--browser-border": "rgba(255,255,255,0.10)",
          "--browser-text": "#e2e8f0",
          "--browser-text-muted": "#94a3b8",
          "--browser-hover": "rgba(255,255,255,0.10)",
          "--browser-input-bg": "rgba(255,255,255,0.05)",
        };
  return {
    ...base,
    "--browser-accent": accent.hex,
    "--browser-accent-soft": accent.soft,
    "--browser-accent-border": accent.border,
  } as React.CSSProperties;
}
