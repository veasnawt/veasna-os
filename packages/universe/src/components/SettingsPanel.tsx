import React, { useEffect, useMemo, useRef, useState } from "react";
import { WALLPAPER_PRESETS, resolveWallpaperUrl, isCustomWallpaper } from "../utils/wallpaperGenerator";
import { THEME_PRESETS, ThemeMode } from "../utils/theme";
import { TaskbarAlignment } from "../types";
import Toggle from "./Toggle";
import AboutOSIcon from "./AboutOSIcon";
import OSUpdateIcon from "./OSUpdateIcon";
import { getSettingsBridge, SettingsBridge, RixieProvider } from "../utils/runtime";

const PROVIDER_LABELS: Record<RixieProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  gemini: "Google Gemini",
};

type KeyStatus = { activeProvider: RixieProvider; configured: Record<RixieProvider, boolean> };

const EMPTY_CONFIGURED: Record<RixieProvider, boolean> = { anthropic: false, openai: false, gemini: false };

/** The web-mode counterpart to the Electron bridge — same shape, backed by
 *  /api/settings/rixie-key instead of an IPC call. That route writes to a gitignored .env.rixie
 *  file inside the checkout (studios/universe/app/api/_lib/rixieEnvFile.ts), read fresh by
 *  /api/agent on every request, so this behaves identically to the packaged app: no restart
 *  needed, key value never sent back to the client once saved. */
const httpKeyBridge: SettingsBridge = {
  async getApiKeyStatus() {
    const res = await fetch("/api/settings/rixie-key");
    if (!res.ok) return { activeProvider: "anthropic", configured: EMPTY_CONFIGURED };
    return res.json();
  },
  async setApiKey(provider, apiKey) {
    const res = await fetch("/api/settings/rixie-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to save (${res.status})`);
    }
  },
  async setActiveProvider(provider) {
    const res = await fetch("/api/settings/rixie-key", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to switch (${res.status})`);
    }
  },
};

/** Lets the user enter Rixie's chat credentials from inside the app itself, instead of
 *  hand-editing a file — via the Electron bridge (Documents/Veasna OS/rixie.env) in the packaged
 *  desktop app, or httpKeyBridge above (a dev-local .env.rixie file) everywhere else. Either way,
 *  it takes effect on Rixie's very next message with no restart needed — Universe's own
 *  /api/agent route re-reads the relevant file fresh on every request.
 *
 *  Keys for every provider you've ever saved stick around (setApiKey merges, never replaces) —
 *  picking an already-configured provider from the dropdown switches to it immediately with no
 *  key re-entry; only a genuinely new provider prompts for one. */
function RixieApiKeySection() {
  const [bridge] = useState<SettingsBridge>(() => getSettingsBridge() ?? httpKeyBridge);
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [provider, setProvider] = useState<RixieProvider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bridge.getApiKeyStatus().then((s) => {
      setStatus(s);
      setProvider(s.activeProvider);
    });
  }, [bridge]);

  async function handleProviderChange(next: RixieProvider) {
    setProvider(next);
    setApiKey("");
    setSaved(null);
    setError(null);
    // Already have a key on file for this one — switch straight to it, no re-entry needed. A
    // provider with no saved key just updates the local selection; handleSave below is what
    // actually persists anything for it.
    if (status?.configured[next] && next !== status.activeProvider) {
      setSaving(true);
      try {
        await bridge.setActiveProvider(next);
        setStatus((prev) => (prev ? { ...prev, activeProvider: next } : prev));
        setSaved(`Switched to ${PROVIDER_LABELS[next]} — Rixie will use it on your next message.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to switch");
      } finally {
        setSaving(false);
      }
    }
  }

  async function handleSave() {
    if (!apiKey.trim()) return;
    setSaving(true);
    setSaved(null);
    setError(null);
    try {
      await bridge.setApiKey(provider, apiKey.trim());
      setStatus((prev) => ({ activeProvider: provider, configured: { ...(prev?.configured ?? EMPTY_CONFIGURED), [provider]: true } }));
      setApiKey("");
      setSaved("Saved — Rixie will use it on your next message.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const isActive = provider === status?.activeProvider;
  const isConfigured = status?.configured[provider] ?? false;

  return (
    <div className="mt-6 space-y-3">
      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--os-text-muted)] font-semibold">
        Rixie AI
      </span>

      <div className="space-y-2.5 rounded-lg border border-[var(--os-border)] px-3 py-3">
        <div className="text-[11px] text-[var(--os-text-muted)]">
          {isActive
            ? isConfigured
              ? `Rixie is currently using ${PROVIDER_LABELS[provider]}.`
              : `Rixie is set to ${PROVIDER_LABELS[provider]}, but no key is saved for it yet — enter one below.`
            : isConfigured
            ? `Switching to ${PROVIDER_LABELS[provider]} — it already has a saved key.`
            : `No key saved for ${PROVIDER_LABELS[provider]} yet — paste one below.`}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as RixieProvider)}
            className="rounded-md border border-[var(--os-border)] bg-[var(--os-surface)] px-2 py-1.5 text-xs text-[var(--os-text)] outline-none focus:border-[var(--os-accent-border)]"
          >
            {(Object.keys(PROVIDER_LABELS) as RixieProvider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
                {status?.configured[p] ? " ✓" : ""}
              </option>
            ))}
          </select>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setSaved(null);
              setError(null);
            }}
            placeholder={isConfigured ? "Paste a new key to replace the saved one" : "Paste your API key"}
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-md border border-[var(--os-border)] bg-[var(--os-surface)] px-2.5 py-1.5 text-xs text-[var(--os-text)] outline-none placeholder:text-[var(--os-text-muted)] focus:border-[var(--os-accent-border)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!apiKey.trim() || saving}
            className="rounded-full bg-[var(--os-accent-soft)] px-3.5 py-1.5 text-[11px] font-semibold text-[var(--os-accent-text)] transition hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "Saving…" : isConfigured ? "Replace key" : "Save"}
          </button>
          {saved && <span className="text-[11px] text-emerald-400">{saved}</span>}
          {error && <span className="text-[11px] text-red-400">{error}</span>}
        </div>
      </div>
    </div>
  );
}

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
  onOpenAboutOS: () => void;
  onOpenOSUpdate: () => void;
}

function SystemRow({
  icon: Icon,
  color,
  name,
  subtitle,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number }>;
  color: string;
  name: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-[var(--os-border)] px-3 py-2.5 text-left transition hover:border-[var(--os-border-strong)] hover:bg-[var(--os-border-strong)]"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 30%, rgba(6, 8, 16, 0.72))`, color }}
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-[var(--os-text)]">{name}</div>
        <div className="text-[10px] text-[var(--os-text-muted)]">{subtitle}</div>
      </div>
      <span className="shrink-0 text-[var(--os-text-muted)]">›</span>
    </button>
  );
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
  const url = useMemo(() => resolveWallpaperUrl(presetId, 240, 135), [presetId]);
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
  onOpenAboutOS,
  onOpenOSUpdate,
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
      <div className="space-y-3">
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

      <RixieApiKeySection />

      <div className="mt-6 space-y-3">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--os-text-muted)] font-semibold">
          System
        </span>

        <SystemRow icon={AboutOSIcon} color="#38bdf8" name="About OS" subtitle="Version, credits" onClick={onOpenAboutOS} />
        <SystemRow icon={OSUpdateIcon} color="#34d399" name="OS Update" subtitle="Check update status" onClick={onOpenOSUpdate} />
      </div>
    </div>
  );
}
