import React, { useEffect, useRef, useState } from "react";
import { Ai, Folder, Document } from "@veasnawt/vicons";
import { CelestialBody, OpenWindow, PinnableId, ShellMode, StudioId, TaskbarAlignment } from "../types";
import { ViewerSummary, FOLDER_COLOR, FILE_COLOR } from "../utils/desktopItems";
import PinContextMenu from "./PinContextMenu";
import TaskbarContextMenu from "./TaskbarContextMenu";
import ModeToggle from "./ModeToggle";

interface TaskbarProps {
  bodies: CelestialBody[];
  icons: Record<StudioId, React.ComponentType<{ size?: number }>>;
  openWindows: OpenWindow[];
  onToggleMinimize: (id: StudioId) => void;
  viewers: ViewerSummary[];
  onToggleViewerMinimize: (id: string) => void;
  pinnedIds: PinnableId[];
  onTogglePin: (id: PinnableId) => void;
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
  mode: ShellMode;
  onModeChange: (mode: ShellMode) => void;
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
  pinnedIds,
  onTogglePin,
  alignment,
  showClock,
  startMenuOpen,
  onToggleStartMenu,
  onOpenApp,
  onOpenFileManager,
  onOpenTaskbarSettings,
  onOpenSearch,
  mode,
  onModeChange,
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
  const unpinnedViewers = viewers.filter((v) => !(pinnedIds.includes("filemanager") && v.id === ""));

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
      const body = bodies.find((b) => b.id === id);
      if (!body) return null;
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
            const color = viewer.kind === "folder" ? FOLDER_COLOR : FILE_COLOR;
            const Icon = viewer.kind === "folder" ? Folder : Document;
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
