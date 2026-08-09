import { autoUpdater } from "electron-updater";
import { ipcMain, BrowserWindow, app } from "electron";

export type UpdateStatus =
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "not-available"; version: string }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string };

/** Wires electron-updater to GitHub Releases on this repo (see electron-builder.yml's `publish`
 *  block) and bridges its events to the renderer over IPC (via preload.ts's window.veasnaUpdater)
 *  so OSUpdateWindow.tsx can show real status instead of a static placeholder. Downloads are NOT
 *  automatic — checking only reports whether an update exists; the user has to explicitly ask to
 *  download it, matching this app's existing "no surprises, no fake progress" approach to status
 *  UI (Task Manager doesn't fabricate CPU numbers; OS Update shouldn't fabricate download activity
 *  either). Only called from main.ts when app.isPackaged — there's nothing to update in dev mode.
 *  `stopAllServers` is main.ts's own forked-server shutdown — see the "updater:install" handler
 *  below for why it has to run BEFORE quitAndInstall(), not just rely on the app's before-quit. */
export function setupAutoUpdater(win: BrowserWindow, stopAllServers: () => Promise<void>) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  function send(status: UpdateStatus) {
    if (!win.isDestroyed()) win.webContents.send("updater:status", status);
  }

  autoUpdater.on("checking-for-update", () => send({ state: "checking" }));
  autoUpdater.on("update-available", (info) => send({ state: "available", version: info.version }));
  autoUpdater.on("update-not-available", (info) => send({ state: "not-available", version: info.version }));
  autoUpdater.on("error", (err) => send({ state: "error", message: err.message }));
  autoUpdater.on("download-progress", (progress) => send({ state: "downloading", percent: progress.percent }));
  autoUpdater.on("update-downloaded", (info) => send({ state: "downloaded", version: info.version }));

  // Each handler's own errors are already surfaced via the "error" event listener above — caught
  // here too just so a rejected autoUpdater promise doesn't ALSO reject the renderer's
  // ipcRenderer.invoke() call and force it to handle the same failure twice.
  ipcMain.handle("updater:check", () => autoUpdater.checkForUpdates().catch(() => {}));
  ipcMain.handle("updater:download", () => autoUpdater.downloadUpdate().catch(() => {}));
  ipcMain.handle("updater:install", async () => {
    // electron-updater's quitAndInstall() spawns the downloaded NSIS installer SYNCHRONOUSLY, and
    // only calls app.quit() a tick later (see BaseUpdater.js) — so by default the installer's own
    // "close the running app" check races against an app (plus its forked Next.js servers, all
    // sharing this exe's image name) that hasn't been told to quit yet. Stopping our own forked
    // servers here first means the installer only has to deal with the one main process instead of
    // three, which is what actually produced NSIS's "Veasna OS cannot be closed" prompt on update.
    await stopAllServers();
    autoUpdater.quitAndInstall();
  });
  ipcMain.handle("updater:get-version", () => app.getVersion());
}
