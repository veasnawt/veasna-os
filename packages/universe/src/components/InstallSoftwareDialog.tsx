import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Check, X, Loader2 } from "lucide-react";
import { INSTALL_SOFTWARE_CATALOG } from "../utils/installSoftwareCatalog";
import { getAppsBridge } from "../utils/runtime";

interface InstallSoftwareDialogProps {
  onClose: () => void;
}

type ItemStatus = "idle" | "installing" | "success" | "error";

/** Installs a real package on the real machine via Windows' own winget CLI — no attempt to also
 *  auto-pin a desktop icon afterward (unlike the web-app/local-app install flows): reliably
 *  locating an arbitrary winget package's installed executable across every package's own install
 *  layout isn't something winget itself exposes cleanly, so this stays honest about what it
 *  actually does — install the real thing, findable from the real Start Menu once it's done. */
export default function InstallSoftwareDialog({ onClose }: InstallSoftwareDialogProps) {
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleInstall(wingetId: string) {
    setStatuses((prev) => ({ ...prev, [wingetId]: "installing" }));
    const bridge = getAppsBridge();
    const result = await bridge?.wingetInstall(wingetId);
    if (result?.status === "success") {
      setStatuses((prev) => ({ ...prev, [wingetId]: "success" }));
    } else {
      setStatuses((prev) => ({ ...prev, [wingetId]: "error" }));
      setErrors((prev) => ({ ...prev, [wingetId]: result?.message || "Install failed" }));
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ zIndex: 99998 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--os-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--os-text)]">Install Software</h2>
          <p className="mt-0.5 text-[11px] text-[var(--os-text-muted)]">
            Installs the real app on your computer via winget — find it in your Start Menu once it's done.
          </p>
        </div>
        <div className="max-h-[360px] space-y-0.5 overflow-y-auto px-2 py-2">
          {INSTALL_SOFTWARE_CATALOG.map((app) => {
            const status = statuses[app.wingetId] ?? "idle";
            return (
              <div key={app.wingetId} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-[var(--os-border-strong)]">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                  style={{ backgroundColor: `color-mix(in srgb, ${app.color} 30%, rgba(6, 8, 16, 0.72))`, color: app.color }}
                >
                  {app.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-[var(--os-text)]">{app.name}</div>
                  <div className="truncate text-[10px] text-[var(--os-text-muted)]" title={status === "error" ? errors[app.wingetId] : undefined}>
                    {status === "error" ? errors[app.wingetId] || "Install failed" : app.description}
                  </div>
                </div>
                <button
                  onClick={() => handleInstall(app.wingetId)}
                  disabled={status === "installing" || status === "success"}
                  className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                    status === "success"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : status === "error"
                        ? "bg-rose-500/20 text-rose-400 hover:opacity-90"
                        : "bg-[var(--os-accent-soft)] text-[var(--os-accent-text)] hover:opacity-90"
                  } ${status === "installing" || status === "success" ? "cursor-default" : ""}`}
                >
                  {status === "installing" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : status === "success" ? (
                    <Check size={12} />
                  ) : status === "error" ? (
                    <X size={12} />
                  ) : (
                    <Download size={12} />
                  )}
                  {status === "installing" ? "Installing…" : status === "success" ? "Installed" : status === "error" ? "Retry" : "Install"}
                </button>
              </div>
            );
          })}
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
