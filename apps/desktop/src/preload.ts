import { contextBridge, ipcRenderer } from "electron";
import type { UpdateStatus } from "./updater";

// The narrow, specific set of privileged bridges this app exposes to the renderer — everything
// else (the desktop shell's own UI) talks to its bundled Next.js server over plain HTTP exactly
// like it does in a browser tab, and BrowserPanel's/StudioFrame's <webview> needs no bridge
// either. Kept as small, purpose-specific APIs rather than a general-purpose "run anything in
// main" bridge.
contextBridge.exposeInMainWorld("veasnaUpdater", {
  check: () => ipcRenderer.invoke("updater:check"),
  download: () => ipcRenderer.invoke("updater:download"),
  install: () => ipcRenderer.invoke("updater:install"),
  getVersion: () => ipcRenderer.invoke("updater:get-version") as Promise<string>,
  onStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on("updater:status", listener);
    return () => ipcRenderer.removeListener("updater:status", listener);
  },
});

contextBridge.exposeInMainWorld("veasnaStudios", {
  getUrls: () => ipcRenderer.invoke("studios:get-urls") as Promise<Record<string, string>>,
  onUrlsChanged: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("studios:urls-changed", listener);
    return () => ipcRenderer.removeListener("studios:urls-changed", listener);
  },
});

contextBridge.exposeInMainWorld("veasnaSettings", {
  getApiKeyStatus: () => ipcRenderer.invoke("settings:get-api-key-status") as Promise<{ provider: string; hasKey: boolean }>,
  setApiKey: (provider: string, apiKey: string) => ipcRenderer.invoke("settings:set-api-key", provider, apiKey) as Promise<void>,
});

contextBridge.exposeInMainWorld("veasnaApps", {
  wingetInstall: (wingetId: string) =>
    ipcRenderer.invoke("apps:winget-install", wingetId) as Promise<{ status: "success" | "error"; message?: string }>,
});
