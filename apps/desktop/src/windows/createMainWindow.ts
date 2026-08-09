import { BrowserWindow, shell } from "electron";
import path from "node:path";

// Appended to the default Chromium UA so renderer code (packages/universe/src/components/Window.tsx)
// can detect "am I running inside the packaged desktop app" — e.g. to fall back BP Studio/Loom
// Engine windows to a "coming soon" card instead of an iframe pointed at a dev server that simply
// doesn't exist in this build (v1 only bundles studios/universe, see the implementation plan).
// A UA suffix is enough for this one low-stakes check — no preload/IPC bridge needed for it.
const DESKTOP_UA_SUFFIX = "VeasnaOSDesktop/1.0";

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: "Veasna OS",
    // electron-builder bakes build/icon.png into the packaged .exe's own resource (Explorer/taskbar
    // pick that up automatically), but `pnpm dev:desktop` never goes through electron-builder at
    // all — set explicitly here too so the dev-mode taskbar/alt-tab icon isn't just Electron's
    // default, matching the packaged app's branding in both run modes.
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    backgroundColor: "#05070d",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // required for webviewTag support
      webviewTag: true, // BrowserPanel.tsx's in-app Browser studio embeds real sites via <webview>
    },
  });

  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} ${DESKTOP_UA_SUFFIX}`);

  // Links that try to open a new top-level window (target="_blank" etc.) get handed to the real OS
  // browser instead of spawning an unmanaged extra Electron window with no chrome of its own.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.once("ready-to-show", () => win.show());

  return win;
}
