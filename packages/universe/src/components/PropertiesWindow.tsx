import React, { useEffect, useState } from "react";
import { Folder, Globe } from "@veasnawt/vicons";
import FloatingWindow from "./FloatingWindow";
import { getFileIcon, getFileColor, getFileKind } from "../utils/fileTypes";
import { FOLDER_COLOR, parentPath } from "../utils/desktopItems";
import { statEntry, EntryStat, FilesApiError } from "../utils/filesApi";

export type PropertiesSubject =
  | { kind: "file" | "folder"; name: string; path: string }
  | { kind: "webapp"; name: string; url: string; color: string };

interface PropertiesWindowProps {
  subject: PropertiesSubject;
  zIndex: number;
  taskbarReserve: number;
  minimized?: boolean;
  onClose: () => void;
  onFocus: () => void;
  onMinimize: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-xs">
      <span className="shrink-0 text-[var(--os-text-muted)]">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-[var(--os-text)]" title={value}>
        {value}
      </span>
    </div>
  );
}

export default function PropertiesWindow({ subject, zIndex, taskbarReserve, minimized, onClose, onFocus, onMinimize }: PropertiesWindowProps) {
  const isFileLike = subject.kind === "file" || subject.kind === "folder";
  const [stat, setStat] = useState<EntryStat | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFileLike) return;
    let cancelled = false;
    setStat(null);
    setError(null);
    statEntry(subject.path)
      .then((s) => {
        if (!cancelled) setStat(s);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof FilesApiError ? err.message : "Couldn't read properties.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when the subject itself changes
  }, [isFileLike, subject.kind === "file" || subject.kind === "folder" ? subject.path : null]);

  const Icon = subject.kind === "webapp" ? Globe : subject.kind === "folder" ? Folder : getFileIcon(subject.name);
  const color = subject.kind === "webapp" ? subject.color : subject.kind === "folder" ? FOLDER_COLOR : getFileColor(subject.name);

  return (
    <FloatingWindow
      title={`${subject.name} Properties`}
      icon={Icon}
      color={color}
      cascadeIndex={0}
      zIndex={zIndex}
      defaultWidth={380}
      defaultHeight={isFileLike ? 380 : 300}
      minWidth={320}
      minHeight={260}
      taskbarReserve={taskbarReserve}
      minimized={minimized}
      onClose={onClose}
      onFocus={onFocus}
      onMinimize={onMinimize}
    >
      <div className="flex h-full flex-col px-5 py-4">
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--os-border)] pb-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `color-mix(in srgb, ${color} 30%, rgba(6, 8, 16, 0.72))`, color }}
          >
            <Icon size={24} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--os-text)]" title={subject.name}>
              {subject.name}
            </div>
            <div className="text-[10px] text-[var(--os-text-muted)]">
              {subject.kind === "webapp" ? "Installed Web App" : subject.kind === "folder" ? "File folder" : getFileKind(subject.name)}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto pt-1">
          {subject.kind === "webapp" ? (
            <>
              <Row label="Type" value="Installed Web App" />
              <Row label="Address" value={subject.url} />
            </>
          ) : error ? (
            <div className="pt-3 text-xs text-rose-400">{error}</div>
          ) : !stat ? (
            <div className="pt-3 text-xs text-[var(--os-text-muted)]">Loading…</div>
          ) : (
            <>
              <Row label="Location" value={`Desktop${parentPath(subject.path) ? "/" + parentPath(subject.path) : ""}`} />
              <Row label="Size" value={formatBytes(stat.size)} />
              <Row label="Created" value={formatDate(stat.birthtime)} />
              <Row label="Modified" value={formatDate(stat.mtime)} />
            </>
          )}
        </div>
      </div>
    </FloatingWindow>
  );
}
