import React, { useRef, useState } from "react";
import FloatingWindow from "./FloatingWindow";
import { isElectronDesktop, WebviewElement } from "../utils/runtime";

interface InstalledAppWindowProps {
  name: string;
  url: string;
  color: string;
  icon: React.ComponentType<{ size?: number }>;
  cascadeIndex: number;
  zIndex: number;
  taskbarReserve: number;
  minimized?: boolean;
  onClose: () => void;
  onFocus: () => void;
  onMinimize: () => void;
}

/** A "installed" web app's window — deliberately minimal chrome (no address bar, no back/forward)
 *  to read as its own app rather than a browser tab, unlike the full Browser studio. */
export default function InstalledAppWindow({
  name,
  url,
  color,
  icon,
  cascadeIndex,
  zIndex,
  taskbarReserve,
  minimized,
  onClose,
  onFocus,
  onMinimize,
}: InstalledAppWindowProps) {
  // Computed once — the app never switches runtimes mid-session.
  const [desktopMode] = useState(isElectronDesktop);
  const webviewRef = useRef<WebviewElement | null>(null);

  return (
    <FloatingWindow
      title={name}
      icon={icon}
      color={color}
      cascadeIndex={cascadeIndex}
      zIndex={zIndex}
      defaultWidth={720}
      defaultHeight={520}
      taskbarReserve={taskbarReserve}
      minimized={minimized}
      onClose={onClose}
      onFocus={onFocus}
      onMinimize={onMinimize}
    >
      {desktopMode ? (
        // Same reasoning as BrowserPanel.tsx: a plain <iframe> is bound by the target site's own
        // X-Frame-Options/CSP frame-ancestors headers — many real web apps (the exact kind someone
        // would want to "install" here) send these and simply refuse to render in an iframe at
        // all, showing a blank window with no explanation. Electron's <webview> is a real separate
        // Chromium guest process, not bound by the *hosting page's* frame restrictions, so it
        // actually loads them. Only relevant in the packaged desktop app — a plain browser tab has
        // no <webview> capability at all, so it keeps using the iframe exactly as before.
        <webview ref={webviewRef} src={url} className="h-full w-full bg-white" />
      ) : (
        <iframe src={url} title={name} className="h-full w-full border-0 bg-white" />
      )}
    </FloatingWindow>
  );
}
