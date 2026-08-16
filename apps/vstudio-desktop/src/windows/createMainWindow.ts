import { BrowserWindow, shell } from "electron";
import path from "node:path";

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: "VStudio",
    // electron-builder bakes build/icon.png into the packaged .exe's own resource (Explorer/taskbar
    // pick that up automatically), but `pnpm dev` never goes through electron-builder at all — set
    // explicitly here too so the dev-mode taskbar/alt-tab icon isn't just Electron's default.
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    backgroundColor: "#0a0c10",
    show: false,
    webPreferences: {
      // No preload script and no <webview> support — unlike apps/desktop (which wraps several
      // studios, one of which embeds arbitrary sites via <webview>), VStudio's own renderer needs
      // no privileged bridge at all: it only ever talks to its own bundled Next.js server over
      // plain fetch, exactly like it does in a browser tab.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Links that try to open a new top-level window (target="_blank" etc.) get handed to the real OS
  // browser instead of spawning an unmanaged extra Electron window with no chrome of its own.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.once("ready-to-show", () => win.show());

  return win;
}
