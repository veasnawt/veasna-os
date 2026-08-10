import React, { useEffect, useRef, useState } from "react";
import { Ai, Folder, Globe } from "@veasnawt/vicons";
import { CelestialBody, OpenWindow, PinnableId, ShellMode, StudioId, TaskbarAlignment } from "../types";
import { ViewerSummary, FOLDER_COLOR } from "../utils/desktopItems";
import { getFileIcon, getFileColor } from "../utils/fileTypes";
import { DesktopEntrySummary } from "./TraditionalShell";
import PinContextMenu from "./PinContextMenu";
import TaskbarContextMenu from "./TaskbarContextMenu";
import ModeToggle from "./ModeToggle";
import SystemTrayControls from "./SystemTrayControls";
import TaskManagerIcon from "./TaskManagerIcon";
import AboutOSIcon from "./AboutOSIcon";
import OSUpdateIcon from "./OSUpdateIcon";

interface TaskbarProps {
  bodies: CelestialBody[];
  icons: Record<StudioId, React.ComponentType<{ size?: number }>>;
  openWindows: OpenWindow[];
  onToggleMinimize: (id: StudioId) => void;
  viewers: ViewerSummary[];
  onToggleViewerMinimize: (id: string) => void;
  /** Every desktop entry (all 8 kinds — see TraditionalShell.tsx's Entry), not just currently-open
   *  ones — resolves a pinned button's name/color/kind even when it isn't running right now (a
   *  pinned file/folder/webapp doesn't stay "open" the way a pinned studio's identity is always
   *  known from the static CELESTIAL_BODIES list). */
  desktopEntries: DesktopEntrySummary[];
  pinnedIds: PinnableId[];
  onTogglePin: (id: PinnableId) => void;
  /** For pinned folder/file/webapp entries that aren't currently open — reopens them the same way
   *  their desktop icon would. */
  onOpenWebApp: (id: string) => void;
  onOpenDesktopPath: (id: string, kind: "folder" | "file", name: string) => void;
  taskManagerOpen: boolean;
  aboutOSOpen: boolean;
  osUpdateOpen: boolean;
  onOpenTaskManager: () => void;
  onOpenAboutOS: () => void;
  onOpenOSUpdate: () => void;
  alignment: TaskbarAlignment;
  showClock: boolean;
  startMenuOpen: boolean;
  onToggleStartMenu: () => void;
  onOpenApp: (body: CelestialBody) => void;
  /** Opens (or focuses) the File Manager window rooted at the Desktop — a List-mode-only pseudo-app,
   *  not a studio, so it's not part of `bodies`/`onOpenApp`. */
  onOpenFileManager: () => void;
  onOpenTaskbarSettings: () => void;
  onOpenSearch: () => void;
  /** Rixie is core to the OS now, not a studio you have to go find — always one click away from
   *  the taskbar, in any mode, regardless of what else is open. */
  onOpenRixie: () => void;
  mode: ShellMode;
  onModeChange: (mode: ShellMode) => void;
  volume: number;
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  brightness: number;
  onBrightnessChange: (brightness: number) => void;
}

const START_MENU_WIDTH = 256;

type PinnedEntry = {
  id: PinnableId;
  name: string;
  color: string;
  icon: React.ComponentType<{ size?: number }>;
  running: boolean;
  active: boolean;
  onClick: () => void;
};

export default function Taskbar({
  bodies,
  icons,
  openWindows,
  onToggleMinimize,
  viewers,
  onToggleViewerMinimize,
  desktopEntries,
  pinnedIds,
  onTogglePin,
  onOpenWebApp,
  onOpenDesktopPath,
  taskManagerOpen,
  aboutOSOpen,
  osUpdateOpen,
  onOpenTaskManager,
  onOpenAboutOS,
  onOpenOSUpdate,
  alignment,
  showClock,
  startMenuOpen,
  onToggleStartMenu,
  onOpenApp,
  onOpenFileManager,
  onOpenTaskbarSettings,
  onOpenRixie,
  onOpenSearch,
  mode,
  onModeChange,
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  brightness,
  onBrightnessChange,
}: TaskbarProps) {
  const [now, setNow] = useState<Date | null>(null);
  const [pinMenu, setPinMenu] = useState<{ x: number; y: number; id: PinnableId } | null>(null);
  const [taskbarMenu, setTaskbarMenu] = useState<{ x: number; y: number } | null>(null);
  const [startMenuLeft, setStartMenuLeft] = useState(8);
  const startBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  const unpinnedOpenWindows = openWindows.filter((w) => !pinnedIds.includes(w.body.id));
  // The Desktop-rooted File Manager viewer reports itself with id "" — pull it out so it can be
  // represented by the pinned button (if pinned) instead of doubling up with the plain viewers list.
  const desktopFmViewer = viewers.find((v) => v.id === "");
  // Any pinned viewer (folder/file/webapp, or "" for File Manager) is represented by its pinned
  // button instead — without this, a pinned webapp/folder/file would show up TWICE while open: once
  // as its pinned button, once again here.
  const unpinnedViewers = viewers.filter((v) => !pinnedIds.includes(v.id === "" ? "filemanager" : v.id));

  const pinnedEntries: PinnedEntry[] = pinnedIds
    .map((id): PinnedEntry | null => {
      if (id === "filemanager") {
        const running = Boolean(desktopFmViewer);
        const active = running && !desktopFmViewer!.minimized;
        return {
          id,
          name: "File Manager",
          color: FOLDER_COLOR,
          icon: Folder,
          running,
          active,
          onClick: () => (running ? onToggleViewerMinimize("") : onOpenFileManager()),
        };
      }
      if (id === "taskmanager") {
        return {
          id,
          name: "Task Manager",
          color: "#f87171",
          icon: TaskManagerIcon,
          running: taskManagerOpen,
          active: taskManagerOpen,
          onClick: onOpenTaskManager,
        };
      }
      if (id === "aboutos") {
        return {
          id,
          name: "About OS",
          color: "#38bdf8",
          icon: AboutOSIcon,
          running: aboutOSOpen,
          active: aboutOSOpen,
          onClick: onOpenAboutOS,
        };
      }
      if (id === "osupdate") {
        return {
          id,
          name: "OS Update",
          color: "#34d399",
          icon: OSUpdateIcon,
          running: osUpdateOpen,
          active: osUpdateOpen,
          onClick: onOpenOSUpdate,
        };
      }
      const body = bodies.find((b) => b.id === id);
      if (body) {
        const win = openWindows.find((w) => w.body.id === body.id);
        const running = Boolean(win);
        const active = running && !win!.minimized;
        return {
          id,
          name: body.name,
          color: body.color,
          icon: icons[body.id],
          running,
          active,
          onClick: () => (running ? onToggleMinimize(body.id) : onOpenApp(body)),
        };
      }
      // webapp / folder / file — resolved via desktopEntries (mirrors the FULL desktop icon list,
      // not just open windows) so this still works for a pinned item that isn't currently open.
      const entry = desktopEntries.find((e) => e.id === id);
      if (!entry) return null; // pinned item no longer exists (deleted file, uninstalled app, ...)
      const viewer = viewers.find((v) => v.id === id);
      const running = Boolean(viewer);
      const active = running && !viewer!.minimized;
      const icon = entry.kind === "webapp" ? Globe : entry.kind === "folder" ? Folder : getFileIcon(entry.name);
      return {
        id,
        name: entry.name,
        color: entry.color,
        icon,
        running,
        active,
        onClick: () => {
          if (running) onToggleViewerMinimize(id);
          else if (entry.kind === "webapp") onOpenWebApp(id);
          else onOpenDesktopPath(id, entry.kind as "folder" | "file", entry.name);
        },
      };
    })
    .filter((e): e is PinnedEntry => e !== null);

  // The Start button moves (e.g. when the taskbar is centered) — keep the popup anchored to it.
  useEffect(() => {
    if (!startMenuOpen) return;
    function updatePosition() {
      if (!startBtnRef.current) return;
      const rect = startBtnRef.current.getBoundingClientRect();
      setStartMenuLeft(Math.min(rect.left, window.innerWidth - START_MENU_WIDTH - 8));
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [startMenuOpen, alignment, pinnedEntries.length, unpinnedOpenWindows.length, unpinnedViewers.length]);

  function openPinMenu(e: React.MouseEvent, id: PinnableId) {
    e.preventDefault();
    e.stopPropagation();
    setPinMenu({ x: e.clientX, y: e.clientY, id });
  }

  return (
    <>
      {startMenuOpen && (
        <div
          style={{ left: startMenuLeft, width: START_MENU_WIDTH }}
          className="fixed bottom-12 z-50 rounded-xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-2 shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
          onClick={(e) => e.stopPropagation()}
        >
          {bodies.map((body) => {
            const Icon = icons[body.id];
            return (
              <button
                key={body.id}
                onClick={() => onOpenApp(body)}
                onContextMenu={(e) => openPinMenu(e, body.id)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${body.color}22`, color: body.color }}
                >
                  <Icon size={14} />
                </span>
                {body.name}
              </button>
            );
          })}
          <button
            onClick={onOpenFileManager}
            onContextMenu={(e) => openPinMenu(e, "filemanager")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${FOLDER_COLOR}22`, color: FOLDER_COLOR }}
            >
              <Folder size={14} />
            </span>
            File Manager
          </button>
        </div>
      )}

      <div
        className={`relative z-40 flex h-11 shrink-0 items-center border-t border-[var(--os-border)] bg-[var(--os-surface-strong)] px-2 backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)] ${
          alignment === "center" ? "justify-center" : "justify-between"
        }`}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setTaskbarMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        <div className="flex items-center gap-2">
          <button
            ref={startBtnRef}
            onClick={onToggleStartMenu}
            className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-bold transition ${
              startMenuOpen
                ? "bg-[var(--os-accent-soft)] text-[var(--os-accent-text)]"
                : "text-[var(--os-text)] hover:bg-[var(--os-border-strong)]"
            }`}
          >
            <Ai size={14} />
            Start
          </button>

          <button
            onClick={onOpenSearch}
            title="Search (Ctrl+K or Ctrl+Space)"
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[var(--os-text-muted)] transition hover:bg-[var(--os-border-strong)] hover:text-[var(--os-text)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
            </svg>
          </button>

          <button
            onClick={onOpenRixie}
            title="Ask Rixie"
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[var(--os-text-muted)] transition hover:bg-[var(--os-border-strong)] hover:text-[#38bdf8]"
          >
            <Ai size={14} />
          </button>

          {pinnedEntries.map((entry) => (
            <button
              key={entry.id}
              onClick={entry.onClick}
              onContextMenu={(e) => openPinMenu(e, entry.id)}
              title={entry.name}
              className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition ${
                entry.active
                  ? "bg-[var(--os-border-strong)] text-[var(--os-text)]"
                  : "text-[var(--os-text-muted)] hover:bg-[var(--os-header)]"
              }`}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded" style={{ color: entry.color }}>
                {React.createElement(entry.icon, { size: 12 })}
              </span>
              {entry.name}
              <span
                className={`h-1 w-1 rounded-full transition ${entry.running ? "bg-[var(--os-accent)]" : "bg-transparent"}`}
              />
            </button>
          ))}

          {unpinnedOpenWindows.map((win) => (
            <button
              key={win.body.id}
              onClick={() => onToggleMinimize(win.body.id)}
              onContextMenu={(e) => openPinMenu(e, win.body.id)}
              className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition ${
                !win.minimized
                  ? "bg-[var(--os-border-strong)] text-[var(--os-text)]"
                  : "text-[var(--os-text-muted)] hover:bg-[var(--os-header)]"
              }`}
            >
              <span
                className="flex h-4 w-4 items-center justify-center rounded"
                style={{ color: win.body.color }}
              >
                {React.createElement(icons[win.body.id], { size: 12 })}
              </span>
              {win.body.name}
            </button>
          ))}

          {unpinnedViewers.map((viewer) => {
            const color =
              viewer.kind === "folder" ? FOLDER_COLOR : viewer.kind === "webapp" ? (viewer.color ?? "#38bdf8") : getFileColor(viewer.name);
            const Icon = viewer.kind === "folder" ? Folder : viewer.kind === "webapp" ? Globe : getFileIcon(viewer.name);
            return (
              <button
                key={viewer.id}
                onClick={() => onToggleViewerMinimize(viewer.id)}
                className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition ${
                  !viewer.minimized
                    ? "bg-[var(--os-border-strong)] text-[var(--os-text)]"
                    : "text-[var(--os-text-muted)] hover:bg-[var(--os-header)]"
                }`}
              >
                <span className="flex h-4 w-4 items-center justify-center rounded" style={{ color }}>
                  <Icon size={12} />
                </span>
                {viewer.name}
              </button>
            );
          })}
        </div>

        <div
          className={`flex items-center gap-2 ${alignment === "center" ? "absolute right-2" : "pr-2"}`}
        >
          <SystemTrayControls
            volume={volume}
            muted={muted}
            onVolumeChange={onVolumeChange}
            onToggleMute={onToggleMute}
            brightness={brightness}
            onBrightnessChange={onBrightnessChange}
          />
          {showClock && (
            <div className="text-[11px] font-mono text-[var(--os-text-muted)]">
              {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
            </div>
          )}
          <ModeToggle mode={mode} onChange={onModeChange} />
        </div>
      </div>

      {pinMenu && (
        <PinContextMenu
          x={pinMenu.x}
          y={pinMenu.y}
          pinned={pinnedIds.includes(pinMenu.id)}
          onTogglePin={() => {
            onTogglePin(pinMenu.id);
            setPinMenu(null);
          }}
          onClose={() => setPinMenu(null)}
        />
      )}

      {taskbarMenu && (
        <TaskbarContextMenu
          x={taskbarMenu.x}
          y={taskbarMenu.y}
          onOpenSettings={() => {
            setTaskbarMenu(null);
            onOpenTaskbarSettings();
          }}
          onClose={() => setTaskbarMenu(null)}
        />
      )}
    </>
  );
}
