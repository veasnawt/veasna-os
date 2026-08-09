import React, { useEffect, useRef, useState } from "react";
import { CelestialBody } from "../types";
import StudioDetailCard from "./StudioDetailCard";
import { isElectronDesktop, resolveStudioLaunchUrl, subscribeStudioUrlsChanged, WebviewElement } from "../utils/runtime";

interface StudioFrameProps {
  body: CelestialBody;
}

/** Renders a studio's `launchUrl` — in the packaged Electron app, BP Studio/Loom Engine/Rixie's
 *  bundled server may live on a different (dynamically-chosen) port than the hardcoded dev-mode
 *  `launchUrl` assumes, so the real runtime URL has to be resolved asynchronously first (see
 *  resolveStudioLaunchUrl). While resolving: a brief loading state. If resolution comes back
 *  `null` (desktop app, but that studio's bundled server never actually started): falls back to
 *  the same "coming soon"-style StudioDetailCard already used for studios with no launchUrl at
 *  all, rather than a webview pointed at a dead loopback port. Once resolved: a real Electron
 *  `<webview>` in the desktop app (not bound by the target's own X-Frame-Options the way an
 *  `<iframe>` is — same reasoning as BrowserPanel.tsx/InstalledAppWindow.tsx), or a plain
 *  `<iframe>` in a browser tab / `pnpm dev`, exactly as before. */
export default function StudioFrame({ body }: StudioFrameProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null | undefined>(undefined);
  const [desktopMode] = useState(isElectronDesktop);
  const webviewRef = useRef<WebviewElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    function resolve() {
      setResolvedUrl(undefined);
      resolveStudioLaunchUrl(body.launchUrl!).then((url) => {
        if (!cancelled) setResolvedUrl(url);
      });
    }
    resolve();
    // Re-resolves after BP Studio's server restarts on a new port (e.g. right after the user
    // saves a new API key in Settings) — a no-op subscription outside the desktop app.
    const unsubscribe = subscribeStudioUrlsChanged(resolve);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [body.launchUrl]);

  if (resolvedUrl === undefined) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0b0e14] text-xs text-slate-400">
        Loading {body.name}…
      </div>
    );
  }

  if (resolvedUrl === null) {
    return <StudioDetailCard body={body} variant="embedded" showHeader={false} />;
  }

  return desktopMode ? (
    <webview ref={webviewRef} src={resolvedUrl} className="h-full w-full bg-white" />
  ) : (
    <iframe src={resolvedUrl} title={body.name} className="h-full w-full border-0 bg-white" />
  );
}
