import React, { useEffect, useRef, useState } from "react";

export type RixieActivity = "idle" | "thinking" | "talking";

/** `text` only matters while `status === "talking"` — a short snippet of what Rixie just said,
 *  shown in an animated speech bubble above her. Deliberately text, not voice/audio — a silent
 *  companion that still feels expressive. */
export interface RixieCompanionState {
  status: RixieActivity;
  text?: string;
}

const POSITION_KEY = "veasna-os:rixie-companion-position";
const SIZE = 64;
const MARGIN = 12;
const BUBBLE_MAX_CHARS = 140;

function defaultPosition() {
  if (typeof window === "undefined") return { x: MARGIN, y: MARGIN };
  return { x: window.innerWidth - SIZE - 24, y: window.innerHeight - SIZE - 96 };
}

function loadPosition(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: MARGIN, y: MARGIN };
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (!raw) return defaultPosition();
    const parsed = JSON.parse(raw);
    if (typeof parsed.x === "number" && typeof parsed.y === "number") return parsed;
  } catch {
    // fall through
  }
  return defaultPosition();
}

function clampToViewport(pos: { x: number; y: number }) {
  const maxX = Math.max(MARGIN, window.innerWidth - SIZE - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - SIZE - MARGIN);
  return { x: Math.min(Math.max(pos.x, MARGIN), maxX), y: Math.min(Math.max(pos.y, MARGIN), maxY) };
}

/** Bubble anchors above the character by default, but flips below when there isn't enough room
 *  near the top of the screen — the character is draggable and can end up anywhere. */
function bubbleSide(pos: { x: number; y: number }): "above" | "below" {
  return pos.y < 160 ? "below" : "above";
}

function truncate(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > BUBBLE_MAX_CHARS ? `${trimmed.slice(0, BUBBLE_MAX_CHARS - 1)}…` : trimmed;
}

const DRAG_THRESHOLD = 4;

/** A tiny floating creature that lives on the desktop independent of Rixie's chat window — a
 *  hidden, just-for-you feature (revealed via a secret keyboard shortcut in VeasnaShell.tsx, never
 *  a visible menu item or setting). Reflects whatever RixieWindow reports via its
 *  onActivityChange callback so it feels alive even when the chat window itself is closed —
 *  clicking it opens/focuses that window. Position is draggable and persisted; nothing here is
 *  resizable or otherwise window-like, so it doesn't reuse FloatingWindow's drag+resize machinery,
 *  just a small self-contained pointer-drag implementation. */
export default function RixieCompanion({ state, onClick }: { state: RixieCompanionState; onClick: () => void }) {
  const [pos, setPos] = useState(loadPosition);
  const [blinking, setBlinking] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleResize() {
      setPos((p) => clampToViewport(p));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Idle blink — a short close-then-open every few seconds, only while actually idle (thinking
  // and talking have their own eye animation, blinking on top would just look busy).
  useEffect(() => {
    if (state.status !== "idle") return;
    const interval = setInterval(
      () => {
        setBlinking(true);
        setTimeout(() => setBlinking(false), 150);
      },
      2600 + Math.random() * 2000
    );
    return () => clearInterval(interval);
  }, [state.status]);

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = pos;
    let dragging = false;

    function handleMove(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) dragging = true;
      if (dragging) setPos(clampToViewport({ x: startPos.x + dx, y: startPos.y + dy }));
    }
    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      if (dragging) {
        setPos((p) => {
          localStorage.setItem(POSITION_KEY, JSON.stringify(p));
          return p;
        });
      } else {
        onClick();
      }
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  const eyeClosed = blinking;
  const bubbleText = state.status === "thinking" ? "…" : state.status === "talking" && state.text ? truncate(state.text) : null;
  const side = bubbleSide(pos);

  return (
    <div
      ref={rootRef}
      onPointerDown={handlePointerDown}
      title="Rixie"
      className="fixed z-[999999] cursor-grab select-none active:cursor-grabbing"
      style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE }}
    >
      {bubbleText && (
        <div
          key={bubbleText}
          className={`absolute w-max max-w-[220px] animate-[rixie-bubble-in_0.18s_ease-out] rounded-2xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] px-3 py-2 text-[11px] leading-relaxed text-[var(--os-text)] shadow-lg backdrop-blur-[var(--os-blur)] ${
            side === "above" ? "bottom-[72px] left-1/2 -translate-x-1/2" : "top-[72px] left-1/2 -translate-x-1/2"
          }`}
        >
          {state.status === "thinking" ? (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--os-text-muted)] [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--os-text-muted)] [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--os-text-muted)]" />
            </span>
          ) : (
            bubbleText
          )}
          <div
            className={`absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-[var(--os-border)] bg-[var(--os-surface-strong)] ${
              side === "above" ? "-bottom-[5px] border-b border-r" : "-top-[5px] border-t border-l"
            }`}
          />
        </div>
      )}
      <svg
        viewBox="0 0 64 64"
        width={SIZE}
        height={SIZE}
        className={`drop-shadow-[0_4px_12px_rgba(56,189,248,0.45)] ${state.status === "idle" ? "animate-[rixie-bob_3.2s_ease-in-out_infinite]" : ""}`}
      >
        <defs>
          <radialGradient id="rixie-companion-body" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="55%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="32" r="27" fill="url(#rixie-companion-body)" />
        <g>
          <ellipse
            cx="23"
            cy="30"
            rx="4"
            ry={eyeClosed ? 0.6 : 5}
            fill="#0b1120"
            className={state.status === "thinking" ? "animate-[rixie-eye-think_1.8s_ease-in-out_infinite]" : ""}
          />
          <ellipse
            cx="41"
            cy="30"
            rx="4"
            ry={eyeClosed ? 0.6 : 5}
            fill="#0b1120"
            className={state.status === "thinking" ? "animate-[rixie-eye-think_1.8s_ease-in-out_infinite]" : ""}
          />
        </g>
        <path d="M24 42 Q32 47 40 42" stroke="#0b1120" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}
