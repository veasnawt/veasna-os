import React, { useEffect, useMemo, useRef, useState } from "react";

export type RixieActivity = "idle" | "thinking" | "talking";

/** `text` only matters while `status === "talking"` — a short snippet of what Rixie just said,
 *  shown in an animated speech bubble above her AND used to infer a mood (see inferMood) that
 *  drives her expression for as long as this status holds. Deliberately text, not voice/audio. */
export interface RixieCompanionState {
  status: RixieActivity;
  text?: string;
}

type Mood = "neutral" | "happy" | "concerned" | "curious" | "focused";

/** Free, local, instant — no extra AI call per message. Deliberately simple keyword/shape
 *  heuristics over the reply text, not a real sentiment model; good enough to feel reactive
 *  without adding latency or cost to every single chat turn. Order matters: checked most-specific
 *  (an apology/error) to least (a bare trailing "!"). */
function inferMood(text: string): Mood {
  const lower = text.toLowerCase();
  if (/\b(sorry|apolog|error|can't|cannot|couldn't|failed|refuse|unable to)\b/.test(lower)) return "concerned";
  if (/```|`[^`]+`|\b(function|const |desktop_run_command|sandboxed|command)\b/.test(lower)) return "focused";
  if (/\?\s*$/.test(text.trim())) return "curious";
  if (/!{1,3}(\s|$)|\b(great|awesome|love it|exciting|yay|perfect|wonderful|nice one)\b/.test(lower)) return "happy";
  return "neutral";
}

const POSITION_KEY = "veasna-os:rixie-companion-position";
const SIZE_W = 76;
const SIZE_H = 122;
const MARGIN = 12;
const BUBBLE_MAX_CHARS = 140;
const WALK_SPEED = 70; // px/second

function defaultPosition() {
  if (typeof window === "undefined") return { x: MARGIN, y: MARGIN };
  return { x: window.innerWidth - SIZE_W - 24, y: window.innerHeight - SIZE_H - 96 };
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
  const maxX = Math.max(MARGIN, window.innerWidth - SIZE_W - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - SIZE_H - MARGIN);
  return { x: Math.min(Math.max(pos.x, MARGIN), maxX), y: Math.min(Math.max(pos.y, MARGIN), maxY) };
}

/** Bubble anchors above her by default, but flips below when she's near the top of the screen —
 *  she can end up anywhere now that she walks/jumps around on her own. */
function bubbleSide(pos: { x: number; y: number }): "above" | "below" {
  return pos.y < 170 ? "below" : "above";
}

const MAX_BUBBLE_LINES = 3;
const LINE_CYCLE_MS = 2600;

/** Splits a reply into a handful of short "key lines" instead of showing just the first sentence
 *  and stopping — RixieCompanion cycles through these one at a time while she's talking, each
 *  hard-truncated individually only if THAT sentence alone is still too long for a bubble (a
 *  genuine run-on). Capped at MAX_BUBBLE_LINES so a long reply doesn't turn into an endless
 *  slideshow — a brief recap, not the whole message read out. */
function extractKeyLines(text: string): string[] {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const sentences =
    trimmed
      .match(/[^.!?]+[.!?]?/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? [];
  const source = sentences.length > 0 ? sentences : [trimmed];
  return source.slice(0, MAX_BUBBLE_LINES).map((s) => (s.length > BUBBLE_MAX_CHARS ? `${s.slice(0, BUBBLE_MAX_CHARS - 1)}…` : s));
}

const DRAG_THRESHOLD = 4;

// y-coordinates sit a few units higher than you'd guess from the eyes' own position (cy=38) —
// deliberate clearance above the newer, taller anime-style eyelid line (see the eyes block below),
// which sits right around y=29-33; brows any lower would visually collide with it.
const BROW_PATH: Record<Mood, { left: string; right: string }> = {
  neutral: { left: "M24,24.5 Q30,22 36,24.5", right: "M44,24.5 Q50,22 56,24.5" },
  happy: { left: "M24,23.5 Q30,19.5 36,23.5", right: "M44,23.5 Q50,19.5 56,23.5" },
  concerned: { left: "M24,27 Q30,30 36,26", right: "M44,26 Q50,30 56,27" },
  curious: { left: "M24,21.5 Q30,17.5 36,24", right: "M44,26 Q50,25 56,25" },
  focused: { left: "M23,24.5 L37,24.5", right: "M43,24.5 L57,24.5" },
};

const MOUTH_PATH: Record<Mood, string> = {
  neutral: "M32,50.5 Q40,54 48,50.5",
  happy: "M30,49.5 Q40,59 50,49.5",
  concerned: "M33,52.5 Q40,49.5 47,52.5",
  curious: "M37,50.5 Q40,53.5 41,50.5",
  focused: "M34,51.5 L46,51.5",
};

/** A tiny chibi companion that lives on the desktop independent of Rixie's chat window — a
 *  hidden, just-for-you feature (revealed via a secret keyboard shortcut in VeasnaShell.tsx, never
 *  a visible menu item or setting). Hand-drawn SVG, not real character art — the honest ceiling of
 *  what's achievable without an actual illustration/image-generation tool, aimed at "cute flat
 *  mascot" rather than anything photorealistic.
 *
 *  Three independent behaviors layered together: (1) draggable, same as before; (2) while idle and
 *  not being dragged, wanders on her own — walks to a random point on screen, occasionally hops
 *  instead, then pauses and repeats; (3) her expression while talking is driven by inferMood() on
 *  Rixie's actual reply text, so she visibly reacts to what's being discussed. */
export default function RixieCompanion({ state, onClick }: { state: RixieCompanionState; onClick: () => void }) {
  const [pos, setPos] = useState(loadPosition);
  const [blinking, setBlinking] = useState(false);
  const [facing, setFacing] = useState<"left" | "right">("left");
  const [walking, setWalking] = useState(false);
  // Whether THIS walk is predominantly vertical (moving mostly up/down the screen) rather than
  // sideways — the closest a flat 2D overlay can get to "walking away/toward" vs. "walking past":
  // vertical movement uses the back view (see render below), horizontal uses the side profile.
  const [walkingAway, setWalkingAway] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [bubbleLineIndex, setBubbleLineIndex] = useState(0);
  // A simple depth cue for the flat 2D overlay: shrinks while she's walking "away" (back view,
  // moving up-screen) and grows back while walking "toward" (moving down-screen), persisting
  // across wander legs rather than resetting each time — so wandering further away over several
  // legs keeps making her smaller, matching how distance actually accumulates.
  const [depthScale, setDepthScale] = useState(1);
  const posRef = useRef(pos);
  const depthScaleRef = useRef(1);
  const draggingRef = useRef(false);
  const walkAnimRef = useRef<number | null>(null);
  const wanderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  useEffect(() => {
    depthScaleRef.current = depthScale;
  }, [depthScale]);

  // The full reply is split into a few key lines (see extractKeyLines) and the bubble cycles through
  // them one at a time, rather than either truncating to one sentence or dumping the whole reply in —
  // a brief recap, not the full message read out. Resets to the first line whenever the reply changes.
  const bubbleLines = useMemo(
    () => (state.status === "talking" && state.text ? extractKeyLines(state.text) : []),
    [state.status, state.text]
  );
  useEffect(() => {
    setBubbleLineIndex(0);
    if (bubbleLines.length < 2) return;
    const interval = setInterval(() => {
      setBubbleLineIndex((i) => (i + 1) % bubbleLines.length);
    }, LINE_CYCLE_MS);
    return () => clearInterval(interval);
  }, [bubbleLines]);

  useEffect(() => {
    function handleResize() {
      setPos((p) => clampToViewport(p));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Idle blink — only while actually idle; thinking/talking have their own eye treatment, blinking
  // on top would just look busy.
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

  // Autonomous wander loop — walks to (occasionally hops in place instead of) a random point on
  // screen every few seconds, but only while idle and not mid-drag. Cancels cleanly the instant a
  // drag starts (checked both before scheduling a new move and on every animation frame of an
  // in-progress walk) so a click-to-open never fights an in-flight autonomous move.
  useEffect(() => {
    if (state.status !== "idle") return;

    function scheduleNext() {
      wanderTimeoutRef.current = setTimeout(
        () => {
          if (draggingRef.current) {
            scheduleNext();
            return;
          }
          if (Math.random() < 0.3) {
            setJumping(true);
            setTimeout(() => {
              setJumping(false);
              scheduleNext();
            }, 700);
            return;
          }
          const target = clampToViewport({
            x: Math.random() * (window.innerWidth - SIZE_W),
            y: Math.random() * (window.innerHeight - SIZE_H),
          });
          const start = posRef.current;
          const dist = Math.hypot(target.x - start.x, target.y - start.y);
          if (dist < 24) {
            scheduleNext();
            return;
          }
          const awayThisLeg = Math.abs(target.y - start.y) > Math.abs(target.x - start.x);
          setFacing(target.x < start.x ? "left" : "right");
          setWalkingAway(awayThisLeg);
          setWalking(true);

          // Depth scale for this leg: moving up-screen while in the away/back-view pose shrinks
          // her further (clamped so she never gets small enough to lose); moving down-screen (or
          // any side-view leg) grows her back toward full size. Scaled by how far she's actually
          // walking so a short hop barely changes size but a long trek does.
          const startScale = depthScaleRef.current;
          const scaleDelta = Math.min(0.3, dist / 300);
          const movingUp = target.y < start.y;
          const endScale = awayThisLeg
            ? movingUp
              ? Math.max(0.45, startScale - scaleDelta)
              : Math.min(1, startScale + scaleDelta)
            : Math.min(1, startScale + (1 - startScale) * 0.5);

          const duration = (dist / WALK_SPEED) * 1000;
          const startTime = performance.now();
          function step(now: number) {
            if (draggingRef.current) {
              setWalking(false);
              scheduleNext();
              return;
            }
            const t = Math.min(1, (now - startTime) / duration);
            const next = { x: start.x + (target.x - start.x) * t, y: start.y + (target.y - start.y) * t };
            setPos(next);
            setDepthScale(startScale + (endScale - startScale) * t);
            if (t < 1) {
              walkAnimRef.current = requestAnimationFrame(step);
            } else {
              setWalking(false);
              localStorage.setItem(POSITION_KEY, JSON.stringify(next));
              scheduleNext();
            }
          }
          walkAnimRef.current = requestAnimationFrame(step);
        },
        4000 + Math.random() * 5000
      );
    }

    scheduleNext();
    return () => {
      if (wanderTimeoutRef.current) clearTimeout(wanderTimeoutRef.current);
      if (walkAnimRef.current) cancelAnimationFrame(walkAnimRef.current);
    };
  }, [state.status]);

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if (walkAnimRef.current) cancelAnimationFrame(walkAnimRef.current);
    if (wanderTimeoutRef.current) clearTimeout(wanderTimeoutRef.current);
    setWalking(false);
    setDepthScale(1);
    draggingRef.current = true;

    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = posRef.current;
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
      draggingRef.current = false;
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
  const mood: Mood = state.status === "talking" && state.text ? inferMood(state.text) : "neutral";
  const bubbleText = state.status === "thinking" ? "…" : state.status === "talking" && bubbleLines.length > 0 ? bubbleLines[bubbleLineIndex] : null;
  const side = bubbleSide(pos);
  const bodyMotion = jumping
    ? "animate-[rixie-jump_0.7s_ease-in-out]"
    : walking
    ? "animate-[rixie-walk_0.5s_ease-in-out_infinite]"
    : state.status === "idle"
    ? "animate-[rixie-bob_3.2s_ease-in-out_infinite]"
    : "";

  return (
    <div
      onPointerDown={handlePointerDown}
      title="Rixie"
      className="fixed z-[999999] cursor-grab select-none active:cursor-grabbing"
      style={{ left: pos.x, top: pos.y, width: SIZE_W, height: SIZE_H }}
    >
      {bubbleText && (
        <div
          key={bubbleText}
          className="absolute w-max max-w-[220px] animate-[rixie-bubble-in_0.18s_ease-out] whitespace-normal break-words rounded-2xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] px-3 py-2 text-[11px] leading-relaxed text-[var(--os-text)] shadow-lg backdrop-blur-[var(--os-blur)]"
          style={{
            left: "50%",
            transform: "translateX(-50%)",
            ...(side === "above" ? { bottom: SIZE_H + 10 } : { top: SIZE_H + 10 }),
          }}
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
          {bubbleLines.length > 1 && (
            <div className="mt-1.5 flex justify-center gap-1">
              {bubbleLines.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 w-1 rounded-full transition-colors ${
                    i === bubbleLineIndex ? "bg-[var(--os-accent)]" : "bg-[var(--os-text-muted)] opacity-40"
                  }`}
                />
              ))}
            </div>
          )}
          <div
            className={`absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-[var(--os-border)] bg-[var(--os-surface-strong)] ${
              side === "above" ? "-bottom-[5px] border-b border-r" : "-top-[5px] border-t border-l"
            }`}
          />
        </div>
      )}

      {/* Depth-scale wrapper, separate from the inner div below — that inner div's own transform
          is driven by a CSS @keyframes animation (bodyMotion) which would otherwise fight over
          the `transform` property with an inline scale set directly on it. Anchored at the
          bottom-center so she shrinks toward her feet, not her middle, like actual perspective. */}
      <div className="h-full w-full" style={{ transform: `scale(${depthScale})`, transformOrigin: "50% 100%" }}>
        <div className={`h-full w-full ${facing === "right" ? "-scale-x-100" : ""} ${bodyMotion}`}>
          <svg viewBox="0 0 80 128" width={SIZE_W} height={SIZE_H} className="overflow-visible drop-shadow-[0_4px_12px_rgba(56,189,248,0.4)]">
          <defs>
            <linearGradient id="rixie-hair" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#24333d" />
              <stop offset="55%" stopColor="#0f1922" />
              <stop offset="100%" stopColor="#05070a" />
            </linearGradient>
            <radialGradient id="rixie-skin" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#ffe9d6" />
              <stop offset="100%" stopColor="#ffd9b8" />
            </radialGradient>
            <radialGradient id="rixie-iris" cx="40%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#a97a52" />
              <stop offset="100%" stopColor="#5c3a24" />
            </radialGradient>
            <linearGradient id="rixie-hoodie" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#8f9bab" />
            </linearGradient>
            <linearGradient id="rixie-sweats" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c3cad4" />
              <stop offset="100%" stopColor="#9aa4b1" />
            </linearGradient>
          </defs>

          {walking && !walkingAway && (
            <>
              {/* Legs — TWO, each its own <g> rotating around the shared hip point in opposite
                  phases (see rixie-leg-swing-f/-b in globals.css), for a real alternating stride
                  instead of a swapped-frame animation. Drawn only while actually walking — idle,
                  thinking, talking, and jumping all still use the front view below. */}
              <g style={{ transformOrigin: "40px 94px" }} className="animate-[rixie-leg-swing-b_0.5s_ease-in-out_infinite]">
                <rect x="34" y="94" width="10" height="26" rx="5" fill="url(#rixie-sweats)" opacity="0.8" />
                <ellipse cx="39" cy="121" rx="6.5" ry="3.5" fill="#e2e8f0" opacity="0.8" />
                <ellipse cx="39" cy="123.2" rx="6.5" ry="1.6" fill="#f8fafc" opacity="0.8" />
              </g>
              <g style={{ transformOrigin: "40px 94px" }} className="animate-[rixie-leg-swing-f_0.5s_ease-in-out_infinite]">
                <rect x="34" y="94" width="10" height="26" rx="5" fill="url(#rixie-sweats)" />
                <ellipse cx="39" cy="121" rx="6.5" ry="3.5" fill="#e2e8f0" />
                <ellipse cx="39" cy="123.2" rx="6.5" ry="1.6" fill="#f8fafc" />
              </g>

              {/* Torso — white crop top base with the hoodie's near-side panel + sleeve over it,
                  matching the front/back views' outfit instead of the old solid dark silhouette.
                  Narrowed to match the slimmer waist/legs. */}
              <path d="M33,58 Q42,54 51,58 L52,68 Q42,72 32,68 Z" fill="#f1f5f9" />
              <path d="M33,58 Q40,55 45,58 L45,92 Q39,98 33,92 Z" fill="url(#rixie-hoodie)" />

              {/* Arm — the single visible (near-side) arm, swinging opposite the front leg. Sleeve
                  fabric for the upper arm (matches the hoodie now, was bare skin), just the hand
                  in skin tone. Pulled in slightly for a slimmer taper. */}
              <g style={{ transformOrigin: "40px 60px" }} className="animate-[rixie-arm-swing_0.5s_ease-in-out_infinite]">
                <path d="M38,60 Q31,66 33,79 Q34,84 37,82 Q36,72 41,62 Z" fill="url(#rixie-hoodie)" />
                <circle cx="34.5" cy="82" r="3" fill="url(#rixie-skin)" />
              </g>

              {/* Neck, with a plain dark choker (no pendant) */}
              <rect x="36" y="52" width="10" height="10" rx="3" fill="url(#rixie-skin)" />
              <rect x="35" y="59" width="12" height="2" rx="1" fill="#1e1b2e" />

              {/* Head — side profile: an oval skull with a small nose bump on the leading edge.
                  Drawn "facing left" by default, same convention the front view's (previously
                  invisible, since it was symmetric) facing flip already used — this is the pose
                  that finally makes that flip visible. */}
              <ellipse cx="42" cy="34" rx="20" ry="23" fill="url(#rixie-skin)" />
              <path d="M24,32 Q20,34 23,38 Q25,36 25,33 Z" fill="url(#rixie-skin)" />

              {/* Ear, on the trailing (back) side */}
              <ellipse cx="60" cy="38" rx="4" ry="6" fill="url(#rixie-skin)" />

              {/* Loose hair hanging down the back/trailing edge, past the shoulder — matches the
                  front and back views' loose-hair style instead of the ponytail this used to be
                  (that mismatch was the "why is her outfit and hair different from different
                  angles" bug's hair-side equivalent). Same two-segment taper technique as the
                  front view's side panels. */}
              <ellipse cx="58" cy="34" rx="12" ry="24" fill="url(#rixie-hair)" transform="rotate(6 58 34)" />
              <ellipse cx="64" cy="68" rx="9" ry="26" fill="url(#rixie-hair)" transform="rotate(-4 64 68)" />
              <path d="M56,14 Q62,40 58,66 Q56,80 60,90" stroke="#000000" strokeWidth="0.6" opacity="0.15" fill="none" />
              <path d="M50,16 Q53,40 50,62" stroke="#f8fafc" strokeWidth="0.5" opacity="0.15" fill="none" />

              {/* Bangs — a plain ellipse over the top-front of the skull, not a hand-built curve
                  (same anti-self-intersection reasoning as the front view's hair shapes). */}
              <ellipse cx="34" cy="16" rx="18" ry="12" fill="url(#rixie-hair)" />
              <path d="M22,18 Q24,10 28,6" stroke="#000000" strokeWidth="0.6" opacity="0.15" fill="none" />

              {/* Eye — single, same line-style treatment as the front view's pair: a curved
                  upper-lid stroke plus one small pupil dot, no filled iris ellipse. */}
              <path d="M27.3,31 Q32,27.5 36.7,31.3" stroke="#0b1120" strokeWidth="1.7" strokeLinecap="round" fill="none" />
              <path d="M28,33.8 Q32,35.6 35.5,34.1" stroke="#0b1120" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.55" />
              <circle cx="32" cy="32.2" r="1.2" fill="#1e1b2e" />
              <circle cx="31.2" cy="31.5" r="0.5" fill="#f8fafc" opacity="0.9" />
              <path d="M27,23 Q32,21 37,23.5" stroke="#0b1120" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.75" />
              <path d="M27,44.5 Q31,46 34,44.7" stroke="#0b1120" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.8" />

              {/* Face-framing fringe over the leading-edge temple, matching the front view's new
                  side fringe — drawn last so it layers on top of the eye/face edge, same as the
                  front view's fringe sitting over its face. */}
              <ellipse cx="21" cy="24" rx="6" ry="16" fill="url(#rixie-hair)" transform="rotate(10 21 24)" />
            </>
          )}

          {walking && walkingAway && (
            <>
              {/* Back view — no face at all needed (nothing is visible from behind), which makes
                  this simpler than the other two poses in some ways: hair covers most of the
                  head, both arms/legs are visible and symmetric, and the hoodie shows as a solid
                  back panel (no unzipped gap, unlike the front). Reuses the exact same leg-swing
                  keyframes as the side profile for a consistent gait. */}
              <g style={{ transformOrigin: "40px 94px" }} className="animate-[rixie-leg-swing-b_0.5s_ease-in-out_infinite]">
                <rect x="24" y="94" width="12" height="34" rx="5" fill="url(#rixie-sweats)" opacity="0.85" />
                <ellipse cx="30" cy="121" rx="6.5" ry="3.5" fill="#e2e8f0" opacity="0.85" />
              </g>
              <g style={{ transformOrigin: "40px 94px" }} className="animate-[rixie-leg-swing-f_0.5s_ease-in-out_infinite]">
                <rect x="44" y="94" width="12" height="34" rx="5" fill="url(#rixie-sweats)" />
                <ellipse cx="50" cy="121" rx="6.5" ry="3.5" fill="#e2e8f0" />
              </g>

              {/* Hood, peeking out from behind the neck, drawn before the back panel so the
                  panel's top edge overlaps its lower half. */}
              <path d="M24,52 Q40,44 56,52 Q40,44 24,52 Z" fill="url(#rixie-hoodie)" />
              <path d="M20,58 Q40,52 60,58 L61,98 Q40,105 19,98 Z" fill="url(#rixie-hoodie)" />

              {/* Arms — both visible and symmetric from behind, unlike the side profile's one.
                  Pulled in closer to the body for a slimmer silhouette. */}
              <path d="M17,60 Q8,66 11,80 Q12,85 16,83 Q15,72 21,64 Z" fill="url(#rixie-hoodie)" />
              <path d="M63,60 Q72,66 69,80 Q68,85 64,83 Q65,72 59,64 Z" fill="url(#rixie-hoodie)" />
              <circle cx="13" cy="83" r="3" fill="url(#rixie-skin)" />
              <circle cx="67" cy="83" r="3" fill="url(#rixie-skin)" />

              {/* Neck + the back of the head/hair — ears peek out on both sides since hair from
                  behind mostly covers the skull, no face features needed at all. */}
              <rect x="34" y="50" width="12" height="14" rx="4" fill="url(#rixie-skin)" />
              <ellipse cx="17" cy="36" rx="3.5" ry="5" fill="url(#rixie-skin)" />
              <ellipse cx="63" cy="36" rx="3.5" ry="5" fill="url(#rixie-skin)" />
              <ellipse cx="40" cy="30" rx="26" ry="26" fill="url(#rixie-hair)" />
              <ellipse cx="40" cy="58" rx="24" ry="36" fill="url(#rixie-hair)" opacity="0.95" />
              <path d="M28,10 Q24,40 26,88" stroke="#000000" strokeWidth="0.6" opacity="0.15" fill="none" />
              <path d="M52,10 Q56,40 54,88" stroke="#000000" strokeWidth="0.6" opacity="0.15" fill="none" />
              <path d="M40,8 Q40,45 40,90" stroke="#f8fafc" strokeWidth="0.5" opacity="0.12" fill="none" />
            </>
          )}

          {!walking && (
            <>
          {/* Hair mass behind the head, for volume at the top/sides — a plain ellipse rather than
              a hand-built bezier silhouette: the earlier multi-curve paths here were quietly
              self-intersecting (a curve looping back the way it came carves a hollow OUT of the
              shape it just drew), rendering as thin slivers instead of a solid mass — which is
              exactly why she read as "bald." Simple primitives can't make that mistake. */}
          <ellipse cx="40" cy="30" rx="29" ry="27" fill="url(#rixie-hair)" />

          {/* Long hair hanging past the shoulders instead of a ponytail — each side is now a
              two-segment taper (wider near the shoulder, narrower toward the tip) with a slight
              opposing rotation, rather than one uniform-width cylinder — reads as hair falling
              and gently curving instead of a rigid rod. Still plain ellipses throughout for the
              same anti-self-intersection reason as the hair mass above. */}
          <ellipse cx="15" cy="46" rx="11" ry="26" fill="url(#rixie-hair)" transform="rotate(-4 15 46)" />
          <ellipse cx="12" cy="79" rx="8" ry="23" fill="url(#rixie-hair)" transform="rotate(4 12 79)" />
          <ellipse cx="65" cy="46" rx="11" ry="26" fill="url(#rixie-hair)" transform="rotate(4 65 46)" />
          <ellipse cx="68" cy="79" rx="8" ry="23" fill="url(#rixie-hair)" transform="rotate(-4 68 79)" />
          <ellipse cx="17" cy="40" rx="3" ry="14" fill="#7dd3fc" opacity="0.28" transform="rotate(4 17 40)" />
          <ellipse cx="63" cy="42" rx="2.6" ry="13" fill="#7dd3fc" opacity="0.22" transform="rotate(-4 63 42)" />

          {/* Individual strand lines over the hair mass/panels for texture — thin, low-opacity,
              gently curved (varying S-bends rather than near-straight arcs) to read as flowing
              strands, just enough to break up the flat fill without risking the self-intersection
              issue a filled shape could (these are simple open strokes, not closed paths). */}
          <path d="M28,8 Q25,20 26,34" stroke="#000000" strokeWidth="0.6" opacity="0.15" fill="none" />
          <path d="M52,8 Q55,20 54,34" stroke="#000000" strokeWidth="0.6" opacity="0.15" fill="none" />
          <path d="M9,28 Q13,52 8,72 Q6,84 11,92" stroke="#000000" strokeWidth="0.6" opacity="0.15" fill="none" />
          <path d="M71,28 Q67,52 72,72 Q74,84 69,92" stroke="#000000" strokeWidth="0.6" opacity="0.15" fill="none" />
          <path d="M20,32 Q16,58 19,90" stroke="#000000" strokeWidth="0.5" opacity="0.1" fill="none" />
          <path d="M60,32 Q64,58 61,90" stroke="#000000" strokeWidth="0.5" opacity="0.1" fill="none" />
          <path d="M18,32 Q17,60 19,92" stroke="#f8fafc" strokeWidth="0.5" opacity="0.12" fill="none" />

          {/* Bare midriff — a sliver of visible skin between the (short) crop top and the pants
              waist. Drawn BEFORE the pants, so the pants' waistband paints over its lower half —
              order matters here, not just presence, since these two shapes overlap. Starts higher
              than you'd guess (y=68) to back-fill the extra skin the shortened crop top now reveals. */}
          <rect x="31" y="68" width="18" height="24" rx="3" fill="url(#rixie-skin)" />

          {/* Wide-leg grey sweatpants instead of the old fitted dark pants — wider rects, a
              lighter grey gradient, and a drawstring at the waist. Narrower + closer together
              than the original wide stance for a slimmer overall silhouette. */}
          <rect x="24" y="86" width="12" height="34" rx="5" fill="url(#rixie-sweats)" />
          <rect x="44" y="86" width="12" height="34" rx="5" fill="url(#rixie-sweats)" />
          <path d="M34,88 Q40,91 46,88" stroke="#f8fafc" strokeWidth="1.2" fill="none" opacity="0.8" />
          <path d="M38,89 L37,98" stroke="#f8fafc" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
          <path d="M42,89 L43,98" stroke="#f8fafc" strokeWidth="1" strokeLinecap="round" opacity="0.7" />

          {/* Sneakers — white, two-tone (slightly darker upper + white sole), repositioned to sit
              under the narrower sweatpants legs above. */}
          <ellipse cx="30" cy="121" rx="6.5" ry="3.5" fill="#e2e8f0" />
          <ellipse cx="50" cy="121" rx="6.5" ry="3.5" fill="#e2e8f0" />
          <ellipse cx="30" cy="123.2" rx="6.5" ry="1.6" fill="#f8fafc" />
          <ellipse cx="50" cy="123.2" rx="6.5" ry="1.6" fill="#f8fafc" />

          {/* Crop top — plain white, cropped right at the bust line rather than down near the
              waist, leaving a much taller sliver of bare midriff below it. Narrowed to match the
              slimmer waist below it. */}
          <path d="M28,62 Q40,57 52,62 L52,71 Q40,76 28,71 Z" fill="#f1f5f9" />

          {/* Arms — hang at her sides, drawn after the skirt so they layer in front of it at the
              shoulders. Pulled in closer to the torso, with a slimmer taper, than the original
              wider-set arms. Hands are drawn separately, AFTER the hoodie below, since the
              hoodie's body panels are wide enough to otherwise bury them entirely at the wrist. */}
          <path d="M27,62 Q18,68 20,81 Q21,86 24,84 Q23,74 29,64 Z" fill="url(#rixie-skin)" />
          <path d="M53,62 Q62,68 60,81 Q59,86 56,84 Q57,74 51,64 Z" fill="url(#rixie-skin)" />

          {/* Open grey hoodie layered over the crop top — unzipped down the middle so the white
              top still shows, oversized sleeves over the arms just drawn, and a hood peeking out
              behind the neck. Drawn AFTER the arms specifically so the sleeves cover them.
              Deliberately NOT a mirror-image pair left-to-right — an open hoodie's two front
              panels hang independently and never drape identically on a real body, so each side
              gets its own curve/width/tilt instead of one shape flipped across the centerline. */}
          <path d="M31,52 Q40,48 49,52 L47,58 Q40,60 33,58 Z" fill="url(#rixie-hoodie)" />
          <path d="M17,59 Q24,54 32,60 L32,90 Q24,97 14,89 Z" fill="url(#rixie-hoodie)" transform="rotate(-3 23 75)" />
          <path d="M63,60 Q57,54 48,58 L48,88 Q57,95 66,90 Z" fill="url(#rixie-hoodie)" transform="rotate(5 57 75)" />
          <path d="M17,61 Q10,66 12,78 Q13,82 17,80 L19,65 Z" fill="url(#rixie-hoodie)" />
          <path d="M63,60 Q71,63 69,76 Q68,81 64,79 L61,64 Z" fill="url(#rixie-hoodie)" />

          {/* Hands — drawn last so they sit visibly on top of the sleeve cuffs above, at the
              wrist, instead of getting swallowed by the hoodie's body panels. */}
          <circle cx="20.5" cy="83" r="3" fill="url(#rixie-skin)" />
          <circle cx="59.5" cy="83" r="3" fill="url(#rixie-skin)" />

          {/* Neck, with a plain dark choker (no pendant) */}
          <rect x="34" y="50" width="12" height="14" rx="4" fill="url(#rixie-skin)" />
          <rect x="33" y="58" width="14" height="2.2" rx="1.1" fill="#1e1b2e" />

          {/* Head — redrawn with a smoother, more even jaw curve (an extra pair of control points
              easing into the chin instead of one abrupt Q-curve down to a point), which reads as
              a more natural face than the previous version's slightly lopsided taper. Same
              overall width (18-62) so eyes/brows/mouth below stay correctly positioned. */}
          <path d="M18,36 Q17,11 40,11 Q63,11 62,36 Q62,48 47,56 Q40,60 33,56 Q18,48 18,36 Z" fill="url(#rixie-skin)" />


          {/* Eyes — line-style rather than filled circles: a curved upper-lid stroke, a fainter
              lower-lid stroke, and one small pupil dot, no filled iris ellipse. Reads as a
              simple 2D sticker/emoji eye instead of the "staring" look a solid colored disc gave
              at this size. The whole group shifts side to side while thinking, as if looking
              around for an answer. */}
          <g className={state.status === "thinking" ? "animate-[rixie-eye-think_1.8s_ease-in-out_infinite]" : ""}>
            {eyeClosed ? (
              <>
                <path d="M25,38 Q30,41 35,38" stroke="#0b1120" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                <path d="M45,38 Q50,41 55,38" stroke="#0b1120" strokeWidth="1.6" strokeLinecap="round" fill="none" />
              </>
            ) : (
              <>
                <path
                  d={`M25.3,36.5 Q30,${mood === "curious" ? 30.5 : 32} 34.7,36.8`}
                  stroke="#0b1120"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  d={`M45.3,36.8 Q50,${mood === "curious" ? 30.5 : 32} 54.7,36.5`}
                  stroke="#0b1120"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  fill="none"
                />
                <path d="M26,39.3 Q30,41.2 34,39.6" stroke="#0b1120" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.55" />
                <path d="M46,39.6 Q50,41.2 54,39.3" stroke="#0b1120" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.55" />
                <circle cx="30" cy="37.3" r="1.3" fill="#1e1b2e" />
                <circle cx="50" cy="37.3" r="1.3" fill="#1e1b2e" />
                <circle cx="29.2" cy="36.6" r="0.55" fill="#f8fafc" opacity="0.9" />
                <circle cx="49.2" cy="36.6" r="0.55" fill="#f8fafc" opacity="0.9" />
              </>
            )}
          </g>

          {/* Eyebrows — mood-driven */}
          <path d={BROW_PATH[mood].left} stroke="#0b1120" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.75" />
          <path d={BROW_PATH[mood].right} stroke="#0b1120" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.75" />

          {/* Mouth — mood-driven */}
          <path d={MOUTH_PATH[mood]} stroke="#0b1120" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.8" />

          {/* Bangs, drawn last so they sit over the top of the head — a solid dome (arc up and
              over, then straight back across the bottom), same fix as the ponytail/hair-mass
              above: no inner cutback curve for a second shape to accidentally hollow out. */}
          <path d="M13,20 Q13,2 40,2 Q67,2 67,20 L13,20 Z" fill="url(#rixie-hair)" />
          <path d="M22,19 Q23,10 27,4" stroke="#000000" strokeWidth="0.6" opacity="0.15" fill="none" />
          <path d="M58,19 Q57,10 53,4" stroke="#000000" strokeWidth="0.6" opacity="0.15" fill="none" />
          <path d="M40,19 Q40,10 40,3" stroke="#f8fafc" strokeWidth="0.5" opacity="0.15" fill="none" />

          {/* Face-framing side fringe — drawn over the temples/upper cheeks, on top of the head
              and eyes below, so more of the face reads as covered by hair instead of the bangs
              stopping flat at the hairline. */}
          <ellipse cx="17" cy="26" rx="7" ry="21" fill="url(#rixie-hair)" transform="rotate(6 17 26)" />
          <ellipse cx="63" cy="26" rx="7" ry="21" fill="url(#rixie-hair)" transform="rotate(-6 63 26)" />
          <path d="M14,14 Q11,30 15,44" stroke="#000000" strokeWidth="0.5" opacity="0.15" fill="none" />
          <path d="M66,14 Q69,30 65,44" stroke="#000000" strokeWidth="0.5" opacity="0.15" fill="none" />
            </>
          )}
        </svg>
        </div>
      </div>
    </div>
  );
}
