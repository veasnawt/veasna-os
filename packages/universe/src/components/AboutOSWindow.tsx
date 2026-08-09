import React, { useEffect, useState } from "react";
import FloatingWindow from "./FloatingWindow";
import AboutOSIcon from "./AboutOSIcon";
import { getUpdaterBridge } from "../utils/runtime";

// Same fallback OSUpdateWindow.tsx uses — shown only in a plain browser tab/`pnpm dev`, where
// there's no packaged app version to ask about at all (window.veasnaUpdater doesn't exist there).
const FALLBACK_VERSION = "0.2.5";

interface AboutOSWindowProps {
  zIndex: number;
  taskbarReserve: number;
  minimized?: boolean;
  onClose: () => void;
  onFocus: () => void;
  onMinimize: () => void;
}

export default function AboutOSWindow({ zIndex, taskbarReserve, minimized, onClose, onFocus, onMinimize }: AboutOSWindowProps) {
  const [bridge] = useState(getUpdaterBridge);
  const [version, setVersion] = useState(FALLBACK_VERSION);

  useEffect(() => {
    if (!bridge) return;
    bridge.getVersion().then(setVersion).catch(() => {});
  }, [bridge]);

  return (
    <FloatingWindow
      title="About OS"
      icon={AboutOSIcon}
      color="#38bdf8"
      cascadeIndex={0}
      zIndex={zIndex}
      defaultWidth={380}
      defaultHeight={360}
      taskbarReserve={taskbarReserve}
      minimized={minimized}
      onClose={onClose}
      onFocus={onFocus}
      onMinimize={onMinimize}
    >
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ backgroundColor: "color-mix(in srgb, #38bdf8 30%, rgba(6, 8, 16, 0.72))", color: "#38bdf8" }}
        >
          <AboutOSIcon size={32} />
        </span>
        <div>
          <div className="text-lg font-semibold text-[var(--os-text)]">Veasna OS</div>
          <div className="text-xs text-[var(--os-text-muted)]">Version {version}</div>
        </div>
        <p className="max-w-[260px] text-xs leading-relaxed text-[var(--os-text-muted)]">
          Spatial 3D Operating System powered by Rixie AI Companion — a desktop-metaphor shell with a real
          file manager, terminal, and browser, all running on top of a living 3D universe.
        </p>
        <div className="text-[10px] text-[var(--os-text-muted)]">© {new Date().getFullYear()} Veasna OS</div>
      </div>
    </FloatingWindow>
  );
}
