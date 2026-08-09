import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isValidAppUrl } from "../utils/installedApps";

interface InstallAppDialogProps {
  onInstall: (name: string, url: string) => void;
  onClose: () => void;
}

export default function InstallAppDialog({ onInstall, onClose }: InstallAppDialogProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const canInstall = name.trim().length > 0 && isValidAppUrl(url);

  function submit() {
    if (!canInstall) return;
    onInstall(name.trim(), url.trim());
    onClose();
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
        className="w-full max-w-[380px] overflow-hidden rounded-2xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--os-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--os-text)]">Install Web App</h2>
          <p className="mt-0.5 text-[11px] text-[var(--os-text-muted)]">
            Adds a desktop shortcut that opens a website in its own window.
          </p>
        </div>
        <div className="flex flex-col gap-3 px-4 py-4">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-[var(--os-text-muted)]">
            Name
            <input
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="e.g. Gmail"
              className="rounded-lg bg-[var(--os-surface)] px-3 py-2 text-sm text-[var(--os-text)] outline outline-1 outline-[var(--os-border)] focus:outline-[var(--os-accent-border)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium text-[var(--os-text-muted)]">
            URL
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="e.g. mail.google.com"
              className="rounded-lg bg-[var(--os-surface)] px-3 py-2 text-sm text-[var(--os-text)] outline outline-1 outline-[var(--os-border)] focus:outline-[var(--os-accent-border)]"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--os-border)] px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-1.5 text-xs font-semibold text-[var(--os-text-muted)] transition hover:bg-[var(--os-border-strong)]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canInstall}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              canInstall
                ? "bg-[var(--os-accent-soft)] text-[var(--os-accent-text)] hover:opacity-90"
                : "cursor-default bg-[var(--os-border-strong)] text-[var(--os-text-muted)] opacity-50"
            }`}
          >
            Install
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
