import React, { useMemo, useRef, useState } from "react";
import { WALLPAPER_PRESETS, generateWallpaper, isCustomWallpaper } from "../utils/wallpaperGenerator";
import { THEME_PRESETS, ThemeMode } from "../utils/theme";
import { TaskbarAlignment } from "../types";
import Toggle from "./Toggle";

interface SettingsPanelProps {
  wallpaper: string;
  onWallpaperChange: (id: string) => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  taskbarAutoHide: boolean;
  onToggleTaskbarAutoHide: () => void;
  taskbarAlignment: TaskbarAlignment;
  onTaskbarAlignmentChange: (alignment: TaskbarAlignment) => void;
  taskbarShowClock: boolean;
  onToggleTaskbarShowClock: () => void;
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB — generous for a photo, small enough to not choke localStorage

const THEME_SWATCH_STYLE: Record<ThemeMode, { bg: string; text: string; accent: string }> = {
  dark: { bg: "#0b0e14", text: "#f1f5f9", accent: "#38bdf8" },
  light: { bg: "#f8fafc", text: "#0f172a", accent: "#0284c7" },
  glass: { bg: "linear-gradient(135deg, #38bdf8, #a855f7)", text: "#ffffff", accent: "#e0f2fe" },
};

function ThemeSwatch({ id }: { id: ThemeMode }) {
  const s = THEME_SWATCH_STYLE[id];
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: s.bg }}>
      {id === "glass" && (
        <div className="absolute inset-2 rounded-md border border-white/40 bg-white/15 backdrop-blur-md" />
      )}
      <span className="absolute bottom-1.5 left-2 text-[11px] font-bold" style={{ color: s.text }}>
        Aa
      </span>
      <span
        className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full shadow-[0_0_6px_currentColor]"
        style={{ backgroundColor: s.accent, color: s.accent }}
      />
    </div>
  );
}

function WallpaperThumb({ presetId }: { presetId: string }) {
  const url = useMemo(() => generateWallpaper(presetId, 240, 135), [presetId]);
  return (
    <div
      className="h-full w-full rounded-lg bg-cover bg-center"
      style={{ backgroundImage: `url(${url})` }}
    />
  );
}

export default function SettingsPanel({
  wallpaper,
  onWallpaperChange,
  theme,
  onThemeChange,
  taskbarAutoHide,
  onToggleTaskbarAutoHide,
  taskbarAlignment,
  onTaskbarAlignmentChange,
  taskbarShowClock,
  onToggleTaskbarShowClock,
}: SettingsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const customSelected = isCustomWallpaper(wallpaper);

  function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Image is too large (max 8MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onWallpaperChange(reader.result);
      }
    };
    reader.onerror = () => setError("Couldn't read that image.");
    reader.readAsDataURL(file);
  }

  return (
    <div className="w-full max-w-2xl p-6">
      <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--os-border)]">
        <span className="h-3 w-3 rounded-full bg-[var(--os-text-muted)] shadow-[0_0_10px_currentColor]" />
        <h3 className="font-display text-sm font-bold text-[var(--os-text)]">Settings</h3>
      </div>

      <div className="mt-5 space-y-3">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--os-text-muted)] font-semibold">
          Appearance
        </span>

        <div className="grid grid-cols-3 gap-3">
          {THEME_PRESETS.map((preset) => {
            const selected = preset.id === theme;
            return (
              <button
                key={preset.id}
                onClick={() => onThemeChange(preset.id)}
                title={preset.description}
                className={`group relative aspect-video overflow-hidden rounded-lg border transition-all ${
                  selected
                    ? "border-[var(--os-accent-border)] ring-2 ring-[var(--os-accent-soft)]"
                    : "border-[var(--os-border)] hover:border-[var(--os-border-strong)]"
                }`}
              >
                <ThemeSwatch id={preset.id} />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/45 px-2 py-1 backdrop-blur-sm">
                  <span className="text-[10px] font-semibold text-white">{preset.name}</span>
                  {selected && (
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--os-accent)] text-[8px] font-bold text-slate-900">
                      ✓
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--os-text-muted)] font-semibold">
          Taskbar
        </span>

        <div className="flex items-center justify-between rounded-lg border border-[var(--os-border)] px-3 py-2.5">
          <div>
            <div className="text-xs font-medium text-[var(--os-text)]">Auto-hide taskbar</div>
            <div className="text-[10px] text-[var(--os-text-muted)]">Hide until you point at the bottom edge</div>
          </div>
          <Toggle checked={taskbarAutoHide} onChange={onToggleTaskbarAutoHide} label="Auto-hide taskbar" />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-[var(--os-border)] px-3 py-2.5">
          <div>
            <div className="text-xs font-medium text-[var(--os-text)]">Show clock</div>
            <div className="text-[10px] text-[var(--os-text-muted)]">Display the time on the right</div>
          </div>
          <Toggle checked={taskbarShowClock} onChange={onToggleTaskbarShowClock} label="Show clock" />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-[var(--os-border)] px-3 py-2.5">
          <div className="text-xs font-medium text-[var(--os-text)]">Icon alignment</div>
          <div
            role="radiogroup"
            aria-label="Icon alignment"
            className="flex items-center gap-1 rounded-full border border-[var(--os-border)] p-0.5"
          >
            {(["left", "center"] as TaskbarAlignment[]).map((option) => (
              <button
                key={option}
                role="radio"
                aria-checked={taskbarAlignment === option}
                onClick={() => onTaskbarAlignmentChange(option)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold capitalize transition ${
                  taskbarAlignment === option
                    ? "bg-[var(--os-accent-soft)] text-[var(--os-accent-text)]"
                    : "text-[var(--os-text-muted)] hover:text-[var(--os-text)]"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--os-text-muted)] font-semibold">
          Desktop Wallpaper
        </span>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {WALLPAPER_PRESETS.map((preset) => {
            const selected = preset.id === wallpaper;
            return (
              <button
                key={preset.id}
                onClick={() => onWallpaperChange(preset.id)}
                className={`group relative aspect-video overflow-hidden rounded-lg border transition-all ${
                  selected
                    ? "border-[var(--os-accent-border)] ring-2 ring-[var(--os-accent-soft)]"
                    : "border-[var(--os-border)] hover:border-[var(--os-border-strong)]"
                }`}
              >
                <WallpaperThumb presetId={preset.id} />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-2 py-1 backdrop-blur-sm">
                  <span className="text-[10px] font-semibold text-white">{preset.name}</span>
                  {selected && (
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--os-accent)] text-[8px] font-bold text-slate-900">
                      ✓
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          <button
            onClick={() => fileInputRef.current?.click()}
            className={`group relative aspect-video overflow-hidden rounded-lg border transition-all ${
              customSelected
                ? "border-[var(--os-accent-border)] ring-2 ring-[var(--os-accent-soft)]"
                : "border-dashed border-[var(--os-border-strong)] hover:border-[var(--os-text-muted)]"
            }`}
          >
            {customSelected ? (
              <>
                <div
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${wallpaper})` }}
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-2 py-1 backdrop-blur-sm">
                  <span className="text-[10px] font-semibold text-white">Custom</span>
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--os-accent)] text-[8px] font-bold text-slate-900">
                    ✓
                  </span>
                </div>
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 text-[10px] font-semibold text-transparent transition-all group-hover:bg-black/50 group-hover:text-white">
                  Change
                </div>
              </>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[var(--os-text-muted)] group-hover:text-[var(--os-text)]">
                <span className="text-lg leading-none">+</span>
                <span className="text-[10px] font-semibold">Upload from device</span>
              </div>
            )}
          </button>
        </div>

        {error && <p className="text-[11px] font-medium text-rose-400">{error}</p>}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
