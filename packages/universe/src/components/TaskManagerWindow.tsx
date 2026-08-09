import React from "react";
import { Folder, Globe } from "@veasnawt/vicons";
import FloatingWindow from "./FloatingWindow";
import TaskManagerIcon from "./TaskManagerIcon";
import { OpenWindow, StudioId } from "../types";
import { ViewerSummary, FOLDER_COLOR } from "../utils/desktopItems";
import { getFileIcon, getFileColor } from "../utils/fileTypes";

interface TaskManagerWindowProps {
  openWindows: OpenWindow[];
  icons: Record<StudioId, React.ComponentType<{ size?: number }>>;
  viewers: ViewerSummary[];
  zIndex: number;
  taskbarReserve: number;
  minimized?: boolean;
  onClose: () => void;
  onFocus: () => void;
  onMinimize: () => void;
  onEndApp: (id: StudioId) => void;
  onSwitchToApp: (id: StudioId) => void;
  onEndViewer: (id: string) => void;
  onSwitchToViewer: (id: string) => void;
}

interface Row {
  key: string;
  name: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number }>;
  color: string;
  minimized: boolean;
  onEnd: () => void;
  onSwitchTo: () => void;
}

/** Shows exactly what's real: every currently open studio window and every open folder/file/web-app
 *  window, with a way to switch to or close each — no fabricated CPU/memory numbers, since this OS
 *  has no way to measure anything like that honestly. */
export default function TaskManagerWindow({
  openWindows,
  icons,
  viewers,
  zIndex,
  taskbarReserve,
  minimized,
  onClose,
  onFocus,
  onMinimize,
  onEndApp,
  onSwitchToApp,
  onEndViewer,
  onSwitchToViewer,
}: TaskManagerWindowProps) {
  const appRows: Row[] = openWindows.map((w) => ({
    key: `app:${w.body.id}`,
    name: w.body.name,
    subtitle: "Studio",
    icon: icons[w.body.id],
    color: w.body.color,
    minimized: w.minimized,
    onEnd: () => onEndApp(w.body.id),
    onSwitchTo: () => onSwitchToApp(w.body.id),
  }));

  const viewerRows: Row[] = viewers.map((v) => ({
    key: `viewer:${v.id}`,
    name: v.name,
    subtitle: v.kind === "folder" ? "Folder" : v.kind === "webapp" ? "Web App" : "File",
    icon: v.kind === "folder" ? Folder : v.kind === "webapp" ? Globe : getFileIcon(v.name),
    color: v.kind === "folder" ? FOLDER_COLOR : v.kind === "webapp" ? (v.color ?? "#38bdf8") : getFileColor(v.name),
    minimized: v.minimized,
    onEnd: () => onEndViewer(v.id),
    onSwitchTo: () => onSwitchToViewer(v.id),
  }));

  const rows = [...appRows, ...viewerRows];

  return (
    <FloatingWindow
      title="Task Manager"
      icon={TaskManagerIcon}
      color="#f87171"
      cascadeIndex={0}
      zIndex={zIndex}
      defaultWidth={420}
      defaultHeight={480}
      taskbarReserve={taskbarReserve}
      minimized={minimized}
      onClose={onClose}
      onFocus={onFocus}
      onMinimize={onMinimize}
    >
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-[var(--os-border)] px-3 py-2 text-[11px] text-[var(--os-text-muted)]">
          {rows.length === 0 ? "Nothing running" : `${rows.length} window${rows.length === 1 ? "" : "s"} open`}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-xs text-[var(--os-text-muted)]">
              Nothing is running right now.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {rows.map((row) => {
                const Icon = row.icon;
                return (
                  <div
                    key={row.key}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-[var(--os-border-strong)]"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `color-mix(in srgb, ${row.color} 30%, rgba(6, 8, 16, 0.72))`, color: row.color }}
                    >
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-[var(--os-text)]">{row.name}</div>
                      <div className="text-[10px] text-[var(--os-text-muted)]">
                        {row.subtitle}
                        {row.minimized ? " · Minimized" : ""}
                      </div>
                    </div>
                    <button
                      onClick={row.onSwitchTo}
                      className="shrink-0 rounded-full bg-[var(--os-accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--os-accent-text)] transition hover:opacity-90"
                    >
                      Switch to
                    </button>
                    <button
                      onClick={row.onEnd}
                      className="shrink-0 rounded-full bg-rose-500/20 px-2.5 py-1 text-[10px] font-semibold text-rose-300 transition hover:bg-rose-500/30"
                    >
                      End task
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </FloatingWindow>
  );
}
