import React from "react";
import { CelestialBody } from "../types";
import StudioDetailCard from "./StudioDetailCard";

interface CosmicHUDProps {
  isAwakened: boolean;
  onAwaken: () => void;
  selectedBody: CelestialBody | null;
  onCloseInspector: () => void;
  onOpenApp?: (body: CelestialBody) => void;
}

export default function CosmicHUD({
  isAwakened,
  onAwaken,
  selectedBody,
  onCloseInspector,
  onOpenApp,
}: CosmicHUDProps) {
  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-6 sm:p-8 select-none">
      {/* Minimalist Brand Mark */}
      <div className="pointer-events-none flex items-center gap-2.5 self-start rounded-full border border-white/[0.06] bg-black/30 px-4 py-2 backdrop-blur-xl">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400/80 animate-pulse" />
        <span className="font-display text-[11px] font-semibold tracking-wide text-slate-200/90">
          VEASNA OS
        </span>
        <span className="text-slate-600 text-[11px]">/</span>
        <span className="font-mono text-[10px] text-sky-300/70">Living Universe</span>
      </div>

      {/* Unawakened State: Minimalist Awakening Pill at Center */}
      {!isAwakened && (
        <div className="pointer-events-auto my-auto mx-auto flex flex-col items-center">
          <button
            onClick={onAwaken}
            className="group flex items-center gap-3 rounded-full border border-sky-400/30 bg-black/50 px-8 py-4 backdrop-blur-2xl shadow-[0_0_50px_rgba(56,189,248,0.25)] transition-all duration-500 hover:scale-105 hover:border-sky-400/60 hover:bg-black/70 hover:shadow-[0_0_80px_rgba(56,189,248,0.4)]"
          >
            <span className="flex h-3 w-3 items-center justify-center rounded-full bg-sky-400">
              <span className="h-3 w-3 animate-ping rounded-full bg-sky-300 opacity-75" />
            </span>
            <span className="font-display text-xs font-bold tracking-wider text-slate-100 uppercase">
              Touch the Guiding Star to Awaken Universe
            </span>
            <span className="font-mono text-sky-400 text-xs transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </button>
        </div>
      )}

      {/* Selected Celestial Body Inspector */}
      {isAwakened && selectedBody && (
        <StudioDetailCard body={selectedBody} onClose={onCloseInspector} variant="overlay" onOpenApp={onOpenApp} />
      )}
    </div>
  );
}
