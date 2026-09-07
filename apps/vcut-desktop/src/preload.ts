import { contextBridge, ipcRenderer } from "electron";

// The privileged bridge this app exposes — the renderer has no filesystem/shell access under
// `contextIsolation`, so anything main-process-only (opening the system browser for sign-in,
// receiving the `vcut://` callback it redirects back to) needs exactly these narrow, purpose-specific
// channels, not a general "run anything in main" bridge. Named `veasna<Feature>`, matching apps/
// desktop's own `contextBridge.exposeInMainWorld` convention.
contextBridge.exposeInMainWorld("veasnaCrashReporter", {
  report: (payload: { context: string; message: string; stack?: string }) => ipcRenderer.invoke("crash:report", payload),
  showLogFolder: () => ipcRenderer.invoke("crash:show-log-folder"),
});

/** Desktop sign-in — see `main.ts`'s own doc comment for the full system-browser-plus-custom-protocol
 *  flow this is one half of. `openSignIn` triggers the main process to open the hosted login page in
 *  the OS browser (`shell.openExternal`, not reachable from the renderer directly); `onCallback`
 *  subscribes to the tokens `main.ts` extracts once that flow redirects back to `vcut://auth-callback`.
 *  `packages/vcut/src/ui/VCutApp.tsx` is the one caller of both — see its own doc comment on why this
 *  lives in the shared package despite being desktop-only (feature-detected via `window.veasnaAuth`'s
 *  presence, not a platform branch). */
contextBridge.exposeInMainWorld("veasnaAuth", {
  openSignIn: () => ipcRenderer.invoke("auth:open-sign-in"),
  onCallback: (callback: (tokens: { accessToken: string; refreshToken: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, tokens: { accessToken: string; refreshToken: string }) => callback(tokens);
    ipcRenderer.on("auth:callback", listener);
    return () => ipcRenderer.removeListener("auth:callback", listener);
  },
});
