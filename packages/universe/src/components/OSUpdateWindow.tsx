import React, { useEffect, useState } from "react";
import { Check } from "@veasnawt/vicons";
import FloatingWindow from "./FloatingWindow";
import OSUpdateIcon from "./OSUpdateIcon";
import { getUpdaterBridge, UpdateStatus } from "../utils/runtime";

const FALLBACK_VERSION = "0.1.0";

interface OSUpdateWindowProps {
  zIndex: number;
  taskbarReserve: number;
  minimized?: boolean;
  onClose: () => void;
  onFocus: () => void;
  onMinimize: () => void;
}

/** Real update checking, via electron-updater against this repo's GitHub Releases (see
 *  apps/desktop/src/updater.ts + electron-builder.yml's `publish` block) — only wired up inside
 *  the packaged Electron app, where `window.veasnaUpdater` actually exists. In a plain browser tab
 *  (or `pnpm dev`) there's no update mechanism at all, so it falls back to a static, honest
 *  "not available here" message rather than pretending to check anything. Downloads are NOT
 *  automatic — checking only reports whether an update exists; installing it is a separate,
 *  explicit step, matching this app's existing philosophy of never faking activity that isn't
 *  actually happening. */
export default function OSUpdateWindow({ zIndex, taskbarReserve, minimized, onClose, onFocus, onMinimize }: OSUpdateWindowProps) {
  const [bridge] = useState(getUpdaterBridge);
  const [version, setVersion] = useState(FALLBACK_VERSION);
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    if (!bridge) return;
    bridge.getVersion().then(setVersion).catch(() => {});
    return bridge.onStatus(setStatus);
  }, [bridge]);

  function handleCheck() {
    if (!bridge) return;
    setStatus({ state: "checking" });
    bridge.check().catch((err) => setStatus({ state: "error", message: err instanceof Error ? err.message : String(err) }));
  }

  function handleDownload() {
    if (!bridge) return;
    bridge.download().catch((err) => setStatus({ state: "error", message: err instanceof Error ? err.message : String(err) }));
  }

  function handleInstall() {
    bridge?.install().catch(() => {});
  }

  const state = status?.state;

  return (
    <FloatingWindow
      title="OS Update"
      icon={OSUpdateIcon}
      color="#34d399"
      cascadeIndex={0}
      zIndex={zIndex}
      defaultWidth={380}
      defaultHeight={320}
      taskbarReserve={taskbarReserve}
      minimized={minimized}
      onClose={onClose}
      onFocus={onFocus}
      onMinimize={onMinimize}
    >
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ backgroundColor: "color-mix(in srgb, #34d399 30%, rgba(6, 8, 16, 0.72))", color: "#34d399" }}
        >
          {state === "available" || state === "downloading" || state === "downloaded" ? (
            <OSUpdateIcon size={32} />
          ) : (
            <Check size={32} />
          )}
        </span>

        {!bridge ? (
          <>
            <div>
              <div className="text-sm font-semibold text-[var(--os-text)]">Not available here</div>
              <div className="text-xs text-[var(--os-text-muted)]">Veasna OS {FALLBACK_VERSION}</div>
            </div>
            <p className="max-w-[260px] text-[11px] leading-relaxed text-[var(--os-text-muted)]">
              Update checking only works in the installed desktop app, not the web version.
            </p>
          </>
        ) : state === "checking" ? (
          <div className="text-sm font-semibold text-[var(--os-text)]">Checking for updates…</div>
        ) : state === "available" ? (
          <>
            <div>
              <div className="text-sm font-semibold text-[var(--os-text)]">Update available</div>
              <div className="text-xs text-[var(--os-text-muted)]">Version {status.version} — you have {version}</div>
            </div>
            <button
              onClick={handleDownload}
              className="rounded-full bg-[var(--os-accent-soft)] px-4 py-1.5 text-xs font-semibold text-[var(--os-accent-text)] transition hover:opacity-90"
            >
              Download update
            </button>
          </>
        ) : state === "downloading" ? (
          <>
            <div className="text-sm font-semibold text-[var(--os-text)]">Downloading update…</div>
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-[var(--os-border)]">
              <div
                className="h-full bg-[#34d399] transition-all"
                style={{ width: `${Math.round(status.percent)}%` }}
              />
            </div>
            <div className="text-[10px] text-[var(--os-text-muted)]">{Math.round(status.percent)}%</div>
          </>
        ) : state === "downloaded" ? (
          <>
            <div>
              <div className="text-sm font-semibold text-[var(--os-text)]">Update ready to install</div>
              <div className="text-xs text-[var(--os-text-muted)]">Version {status.version}</div>
            </div>
            <button
              onClick={handleInstall}
              className="rounded-full bg-[var(--os-accent-soft)] px-4 py-1.5 text-xs font-semibold text-[var(--os-accent-text)] transition hover:opacity-90"
            >
              Restart &amp; install
            </button>
          </>
        ) : state === "error" ? (
          <>
            <div className="text-sm font-semibold text-[var(--os-text)]">Couldn&apos;t check for updates</div>
            <p className="max-w-[260px] text-[11px] leading-relaxed text-rose-400">{status.message}</p>
            <button
              onClick={handleCheck}
              className="rounded-full bg-[var(--os-accent-soft)] px-4 py-1.5 text-xs font-semibold text-[var(--os-accent-text)] transition hover:opacity-90"
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <div>
              <div className="text-sm font-semibold text-[var(--os-text)]">
                {state === "not-available" ? "You're up to date" : "Check for updates"}
              </div>
              <div className="text-xs text-[var(--os-text-muted)]">Veasna OS {version}</div>
            </div>
            <button
              onClick={handleCheck}
              className="rounded-full bg-[var(--os-accent-soft)] px-4 py-1.5 text-xs font-semibold text-[var(--os-accent-text)] transition hover:opacity-90"
            >
              Check for updates
            </button>
          </>
        )}
      </div>
    </FloatingWindow>
  );
}
