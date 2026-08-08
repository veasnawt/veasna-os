import React, { useEffect, useRef, useState } from "react";
import { Ai, Folder, Document } from "@veasnawt/vicons";
import { CelestialBody, OpenWindow, StudioId, TaskbarAlignment } from "../types";
import { ViewerSummary, FOLDER_COLOR, FILE_COLOR } from "../utils/desktopItems";
import PinContextMenu from "./PinContextMenu";
import TaskbarContextMenu from "./TaskbarContextMenu";

interface TaskbarProps {
  bodies: CelestialBody[];
  icons: Record<StudioId, React.ComponentType<{ size?: number }>>;
  openWindows: OpenWindow[];
  onToggleMinimize: (id: StudioId) => void;
  viewers: ViewerSummary[];
  onToggleViewerMinimize: (id: string) => void;
  pinnedIds: StudioId[];
  onTogglePin: (id: StudioId) => void;
  alignment: TaskbarAlignment;
  showClock: boolean;
  startMenuOpen: boolean;
  onToggleStartMenu: () => void;
  onOpenApp: (body: CelestialBody) => void;
  onOpenTaskbarSettings: () => void;
}

const START_MENU_WIDTH = 256;

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
  onOpenTaskbarSettings,
}: TaskbarProps) {
  const [now, setNow] = useState<Date | null>(null);
  const [pinMenu, setPinMenu] = useState<{ x: number; y: number; studioId: StudioId } | null>(null);
  const [taskbarMenu, setTaskbarMenu] = useState<{ x: number; y: number } | null>(null);
  const [startMenuLeft, setStartMenuLeft] = useState(8);
  const startBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  const pinnedBodies = pinnedIds
    .map((id) => bodies.find((b) => b.id === id))
    .filter((b): b is CelestialBody => Boolean(b));
  const unpinnedOpenWindows = openWindows.filter((w) => !pinnedIds.includes(w.body.id));

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
  }, [startMenuOpen, alignment, pinnedBodies.length, unpinnedOpenWindows.length, viewers.length]);

  function openPinMenu(e: React.MouseEvent, studioId: StudioId) {
    e.preventDefault();
    e.stopPropagation();
    setPinMenu({ x: e.clientX, y: e.clientY, studioId });
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

          {pinnedBodies.map((body) => {
            const win = openWindows.find((w) => w.body.id === body.id);
            const running = Boolean(win);
            const active = running && !win!.minimized;
            return (
              <button
                key={body.id}
                onClick={() => (running ? onToggleMinimize(body.id) : onOpenApp(body))}
                onContextMenu={(e) => openPinMenu(e, body.id)}
                title={body.name}
                className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-[var(--os-border-strong)] text-[var(--os-text)]"
                    : "text-[var(--os-text-muted)] hover:bg-[var(--os-header)]"
                }`}
              >
                <span className="flex h-4 w-4 items-center justify-center rounded" style={{ color: body.color }}>
                  {React.createElement(icons[body.id], { size: 12 })}
                </span>
                {body.name}
                <span
                  className={`h-1 w-1 rounded-full transition ${running ? "bg-[var(--os-accent)]" : "bg-transparent"}`}
                />
              </button>
            );
          })}

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

          {viewers.map((viewer) => {
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

        {showClock && (
          <div
            className={`text-[11px] font-mono text-[var(--os-text-muted)] ${
              alignment === "center" ? "absolute right-2" : "pr-2"
            }`}
          >
            {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
          </div>
        )}
      </div>

      {pinMenu && (
        <PinContextMenu
          x={pinMenu.x}
          y={pinMenu.y}
          pinned={pinnedIds.includes(pinMenu.studioId)}
          onTogglePin={() => {
            onTogglePin(pinMenu.studioId);
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
