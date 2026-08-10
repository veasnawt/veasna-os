import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ambientAudio } from "../utils/ambientAudio";

interface SystemTrayControlsProps {
  volume: number;
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  brightness: number;
  onBrightnessChange: (brightness: number) => void;
}

function SpeakerIcon({ muted, volume }: { muted: boolean; volume: number }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 9v6h4l5 5V4L8 9H4z" strokeLinecap="round" strokeLinejoin="round" />
      {!muted && volume > 0 && <path d="M16.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />}
      {!muted && volume > 55 && <path d="M19 6a9 9 0 0 1 0 12" strokeLinecap="round" />}
      {muted && <path d="M18 9l4 6M22 9l-4 6" strokeLinecap="round" />}
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

const PANEL_WIDTH = 176;

/** A popover anchored to its own trigger button, portaled to document.body — the trigger lives
 *  inside Taskbar, whose own root is a positioned (`relative z-40`) element that establishes a
 *  stacking context capping anything rendered from inside it (same underlying issue fixed for
 *  PinContextMenu/TaskbarContextMenu earlier). Without the portal, clicks on parts of the screen
 *  with higher effective stacking than z-40 (an open window, desktop icons) never reach this
 *  popover's own backdrop, so "click outside to close" silently does nothing there. */
function TrayPopover({ anchorRef, onClose, children }: { anchorRef: React.RefObject<HTMLElement | null>; onClose: () => void; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      left: Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8),
      bottom: window.innerHeight - rect.top + 8,
    });
  }, [anchorRef]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!pos) return null;

  return createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: 9499 }} onClick={onClose} />
      <div
        style={{ left: pos.left, bottom: pos.bottom, width: PANEL_WIDTH, zIndex: 9500 }}
        className="fixed rounded-lg border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-3 shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

/** Volume and brightness — the two real (not cosmetic) system controls: volume scales the Cosmos
 *  ambient drone's actual gain (ambientAudio.ts) and plays an audible confirmation blip on release
 *  (the drone itself only ever plays in 3D Cosmos mode, so without the blip the slider would have
 *  no perceptible effect at all in the far more common Desktop/List view). Brightness applies a
 *  real CSS filter to the whole screen (see VeasnaShell.tsx's document.body effect). Lives in the
 *  taskbar's system tray, next to the clock/ModeToggle, matching where a real OS puts these. */
export default function SystemTrayControls({
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  brightness,
  onBrightnessChange,
}: SystemTrayControlsProps) {
  const [openPanel, setOpenPanel] = useState<"volume" | "brightness" | null>(null);
  const volumeBtnRef = useRef<HTMLButtonElement>(null);
  const brightnessBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="flex items-center gap-0.5">
      <button
        ref={brightnessBtnRef}
        onClick={() => setOpenPanel((p) => (p === "brightness" ? null : "brightness"))}
        title={`Brightness: ${brightness}%`}
        className={`flex h-6 w-6 items-center justify-center rounded transition ${
          openPanel === "brightness"
            ? "bg-[var(--os-accent-soft)] text-[var(--os-accent-text)]"
            : "text-[var(--os-text-muted)] hover:bg-[var(--os-border-strong)] hover:text-[var(--os-text)]"
        }`}
      >
        <SunIcon />
      </button>
      {openPanel === "brightness" && (
        <TrayPopover anchorRef={brightnessBtnRef} onClose={() => setOpenPanel(null)}>
          <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-[var(--os-text)]">
            <span>Brightness</span>
            <span className="text-[var(--os-text-muted)]">{brightness}%</span>
          </div>
          <input
            type="range"
            min={30}
            max={150}
            value={brightness}
            onChange={(e) => onBrightnessChange(Number(e.target.value))}
            className="w-full accent-[var(--os-accent)]"
          />
        </TrayPopover>
      )}

      <button
        ref={volumeBtnRef}
        onClick={() => setOpenPanel((p) => (p === "volume" ? null : "volume"))}
        onDoubleClick={onToggleMute}
        title={muted ? "Muted (double-click to unmute)" : `Volume: ${volume}% (double-click to mute)`}
        className={`flex h-6 w-6 items-center justify-center rounded transition ${
          openPanel === "volume"
            ? "bg-[var(--os-accent-soft)] text-[var(--os-accent-text)]"
            : "text-[var(--os-text-muted)] hover:bg-[var(--os-border-strong)] hover:text-[var(--os-text)]"
        }`}
      >
        <SpeakerIcon muted={muted} volume={volume} />
      </button>
      {openPanel === "volume" && (
        <TrayPopover anchorRef={volumeBtnRef} onClose={() => setOpenPanel(null)}>
          <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-[var(--os-text)]">
            <button onClick={onToggleMute} className="text-[var(--os-text)] hover:text-[var(--os-accent-text)]">
              {muted ? "Unmute" : "Volume"}
            </button>
            <span className="text-[var(--os-text-muted)]">{muted ? "Muted" : `${volume}%`}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            onMouseUp={() => ambientAudio.playTestTone()}
            onKeyUp={() => ambientAudio.playTestTone()}
            className="w-full accent-[var(--os-accent)]"
          />
        </TrayPopover>
      )}
    </div>
  );
}
