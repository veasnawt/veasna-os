import React from "react";

/** True only inside the packaged Electron desktop app's main window — set via a UA suffix in
 *  apps/desktop/src/windows/createMainWindow.ts. A plain browser tab (or `pnpm dev` viewed in one)
 *  never matches. Used to gate the handful of places where the desktop app's capabilities or
 *  bundled-app scope differ from the web version (BrowserPanel's/InstalledAppWindow's <webview> vs
 *  <iframe>, Window's fallback for studios not bundled in the desktop app). */
export function isElectronDesktop(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("VeasnaOSDesktop/");
}

// Electron's <webview> tag is a custom element with no built-in JSX typings in a plain web
// project — declared once here (shared by every component that renders one) rather than
// duplicated per-component.
export type WebviewElement = HTMLElement & { src: string; reload: () => void };

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<WebviewElement>, WebviewElement> & {
        src?: string;
      };
    }
  }
}

// Mirrors apps/desktop/src/updater.ts's UpdateStatus — duplicated rather than imported since
// apps/desktop and packages/universe are separate TypeScript projects (Node/Electron vs.
// browser/React) with no shared-types package between them; this is a small enough, stable enough
// shape that keeping both sides honest by hand is simpler than introducing one just for this.
export type UpdateStatus =
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "not-available"; version: string }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string };

export interface UpdaterBridge {
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  getVersion: () => Promise<string>;
  onStatus: (callback: (status: UpdateStatus) => void) => () => void;
}

declare global {
  interface Window {
    veasnaUpdater?: UpdaterBridge;
  }
}

/** Only defined inside the packaged Electron desktop app (exposed by apps/desktop/src/preload.ts)
 *  — undefined in a plain browser tab or `pnpm dev`, where there's no real update mechanism at
 *  all (a web page doesn't "install updates", it just serves whatever's currently deployed). */
export function getUpdaterBridge(): UpdaterBridge | undefined {
  return typeof window !== "undefined" ? window.veasnaUpdater : undefined;
}

export interface StudiosBridge {
  /** { bp?: "http://127.0.0.1:PORT", gamedev?: "http://127.0.0.1:PORT" } — only present for
   *  studios apps/desktop/src/main.ts actually managed to spawn/serve; empty in dev mode (nothing
   *  to override there, see resolveStudioLaunchUrl below). */
  getUrls: () => Promise<Record<string, string>>;
  /** Fires after BP Studio's server is restarted with a new port (e.g. right after the user saves
   *  a new API key in Settings, which needs a fresh fork for the new env var to take effect). */
  onUrlsChanged: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    veasnaStudios?: StudiosBridge;
  }
}

const DEV_PORT_TO_STUDIO_KEY: Record<string, string> = { "3001": "bp", "5173": "gamedev" };
let cachedStudioUrls: Promise<Record<string, string>> | null = null;
let subscribedToUrlChanges = false;

function getStudioUrls(): Promise<Record<string, string>> {
  const bridge = typeof window !== "undefined" ? window.veasnaStudios : undefined;
  if (!bridge) return Promise.resolve({});
  if (!subscribedToUrlChanges) {
    subscribedToUrlChanges = true;
    bridge.onUrlsChanged(() => {
      cachedStudioUrls = null;
    });
  }
  if (!cachedStudioUrls) cachedStudioUrls = bridge.getUrls().catch(() => ({}));
  return cachedStudioUrls;
}

/** Lets a component (StudioFrame) re-resolve its studio's URL after BP Studio's server restarts
 *  with a new port, without needing to know anything about IPC itself. No-ops outside the desktop
 *  app (there's nothing to subscribe to). */
export function subscribeStudioUrlsChanged(callback: () => void): () => void {
  const bridge = typeof window !== "undefined" ? window.veasnaStudios : undefined;
  if (!bridge) return () => {};
  return bridge.onUrlsChanged(callback);
}

export type RixieProvider = "anthropic" | "openai" | "gemini";

export interface SettingsBridge {
  /** Never returns the actual key value — only whether one is currently configured, and for
   *  which provider. The renderer's Settings UI never needs (or should have) the real secret once
   *  it's been saved. */
  getApiKeyStatus: () => Promise<{ provider: RixieProvider; hasKey: boolean }>;
  /** Writes the key to Documents/Veasna OS/rixie.env — takes effect on Rixie's very next message,
   *  no restart needed (Universe's own /api/agent route re-reads that file per-request). */
  setApiKey: (provider: RixieProvider, apiKey: string) => Promise<void>;
}

declare global {
  interface Window {
    veasnaSettings?: SettingsBridge;
  }
}

/** Only defined inside the packaged Electron desktop app — undefined in a plain browser tab or
 *  `pnpm dev`, where Rixie's key is configured the ordinary way (studios/universe/.env.local) and
 *  needs no in-app UI. */
export function getSettingsBridge(): SettingsBridge | undefined {
  return typeof window !== "undefined" ? window.veasnaSettings : undefined;
}

export interface LocalAppPickResult {
  path: string;
  name: string;
  /** Windows Shell's own icon for the picked file, as a data: URL — undefined if extraction
   *  failed (the desktop icon falls back to a generic glyph in that case). */
  iconDataUrl?: string;
}

export interface AppsBridge {
  /** Opens a native "choose an application" file picker (.exe/.lnk). Resolves to null if the user
   *  cancels rather than rejecting, so callers don't need a try/catch just to handle "no-op". */
  pickLocal: () => Promise<LocalAppPickResult | null>;
  /** Launches the real app at `path` on the real machine via Electron's shell.openPath — resolves
   *  to "" on success or a human-readable error message on failure; never rejects. */
  launchLocal: (path: string) => Promise<string>;
}

declare global {
  interface Window {
    veasnaApps?: AppsBridge;
  }
}

/** Only defined inside the packaged Electron desktop app — there's no way to launch a real native
 *  executable (or show a native file picker) from a plain browser tab, so "Add Local App" is
 *  entirely absent there, not just disabled. */
export function getAppsBridge(): AppsBridge | undefined {
  return typeof window !== "undefined" ? window.veasnaApps : undefined;
}

/** `CELESTIAL_BODIES`' `launchUrl`s are hardcoded to each studio's well-known DEV port (bp:3001,
 *  gamedev:5173) — correct as-is in a browser tab or `pnpm dev`, where those dev servers really do
 *  run on those fixed ports. Inside the packaged Electron app, BP Studio and Game Dev Studio are
 *  bundled and launched on their own DYNAMICALLY chosen loopback ports instead (same reasoning as
 *  Universe's own server — a fixed port isn't guaranteed free, and a real `pnpm dev:all` might
 *  already be using it on this exact machine), so their real runtime origin has to be substituted
 *  in. Returns the ORIGINAL launchUrl unchanged outside the desktop app (nothing to override) or
 *  for any port this function doesn't recognize (defensive passthrough); returns `null` — a
 *  distinct, meaningful "genuinely unavailable" — when running in the desktop app AND the studio's
 *  bundled server never actually started (Window.tsx should show its "coming soon"-style fallback
 *  in that case, not a webview pointed at a dead loopback port). */
export async function resolveStudioLaunchUrl(launchUrl: string): Promise<string | null> {
  if (!isElectronDesktop()) return launchUrl;
  let parsed: URL;
  try {
    parsed = new URL(launchUrl);
  } catch {
    return launchUrl;
  }
  const key = DEV_PORT_TO_STUDIO_KEY[parsed.port];
  if (!key) return launchUrl;
  const urls = await getStudioUrls();
  const resolvedOrigin = urls[key];
  if (!resolvedOrigin) return null;
  const resolved = new URL(resolvedOrigin);
  parsed.protocol = resolved.protocol;
  parsed.hostname = resolved.hostname;
  parsed.port = resolved.port;
  return parsed.toString();
}
