import { contextBridge, ipcRenderer } from "electron";

// The one privileged bridge this app exposes — see `createMainWindow.ts`'s own updated comment for
// why this app now has a preload at all (it deliberately didn't before): the renderer has no
// filesystem access under `contextIsolation`, so getting a crash report from the page into the
// on-disk log needs exactly one narrow, purpose-specific channel, not a general "run anything in
// main" bridge. Named `veasnaCrashReporter`, matching apps/desktop's own `veasna<Feature>` namespace
// convention for `contextBridge.exposeInMainWorld` calls.
contextBridge.exposeInMainWorld("veasnaCrashReporter", {
  report: (payload: { context: string; message: string; stack?: string }) => ipcRenderer.invoke("crash:report", payload),
  showLogFolder: () => ipcRenderer.invoke("crash:show-log-folder"),
});
