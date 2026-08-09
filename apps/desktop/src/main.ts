import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "node:path";
import { createMainWindow } from "./windows/createMainWindow";
import { spawnNextServer } from "./server/spawnNextServer";
import { serveStaticDir } from "./server/serveStaticDir";
import { loadRixieEnv, getApiKeyStatus, setApiKey, RixieProvider } from "./server/rixieEnvFile";
import { setupAutoUpdater } from "./updater";

const stopFns: (() => Promise<void>)[] = [];

// Populated as each bundled studio finishes starting — read by the renderer via the
// "studios:get-urls" IPC handler (packages/universe/src/utils/runtime.ts's
// resolveStudioLaunchUrl) to substitute real dynamic ports in for the hardcoded dev-mode ones.
// Registered unconditionally (not just when packaged) so the renderer's IPC call never hits a
// "no handler registered" error in dev mode — it just resolves to {}, which
// resolveStudioLaunchUrl already treats as "nothing to override" there.
const studioUrls: Record<string, string> = {};
ipcMain.handle("studios:get-urls", () => studioUrls);

function workspaceRoot(): string {
  return path.join(app.getPath("documents"), "Veasna OS");
}

ipcMain.handle("settings:get-api-key-status", () => getApiKeyStatus());

// Rixie's chat lives in Universe's own /api/agent route now (moved from BP Studio), which reads
// Documents/Veasna OS/rixie.env fresh on every request — no server restart needed for a newly
// saved key to take effect, unlike when this lived in BP Studio and required killing and
// re-forking its whole server.
ipcMain.handle("settings:set-api-key", (_event, provider: RixieProvider, apiKey: string) => {
  setApiKey(provider, apiKey);
});

// "Add Local App" (packages/universe's DesktopContextMenu) — a real native picker, not a custom
// dialog, since the whole point is choosing among the user's OWN already-installed software. Only
// meaningful inside a real desktop app (window.veasnaApps is undefined in a plain browser tab, see
// runtime.ts's getAppsBridge), so there's no dev-mode/web fallback to consider here.
ipcMain.handle("apps:pick-local", async () => {
  const win = BrowserWindow.getFocusedWindow();
  const openDialogOptions: Electron.OpenDialogOptions = {
    title: "Choose an application",
    properties: ["openFile"],
    filters: [
      { name: "Applications", extensions: ["exe", "lnk"] },
      { name: "All Files", extensions: ["*"] },
    ],
  };
  const result = win ? await dialog.showOpenDialog(win, openDialogOptions) : await dialog.showOpenDialog(openDialogOptions);
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const name = path.basename(filePath).replace(/\.(exe|lnk)$/i, "");
  let iconDataUrl: string | undefined;
  try {
    // Windows Shell's own icon for this exact file — real branding, not a generic glyph. Wrapped in
    // try/catch since extraction failing shouldn't block installing the shortcut itself; the
    // renderer falls back to a generic icon when this comes back undefined.
    const icon = await app.getFileIcon(filePath, { size: "large" });
    iconDataUrl = icon.toDataURL();
  } catch {
    // Fall through with no icon.
  }
  return { path: filePath, name, iconDataUrl };
});

// shell.openPath resolves with a human-readable error string on failure ("" on success) — it does
// NOT reject, so this needs no try/catch of its own; the renderer surfaces a non-empty result as
// an error banner.
ipcMain.handle("apps:launch-local", (_event, filePath: string) => shell.openPath(filePath));

/** Spawns Universe (the actual OS shell — must work, and now also hosts Rixie's chat) plus,
 *  best-effort, BP Studio and Game Dev Studio (bundled but non-critical: if either fails to
 *  start, Window.tsx's StudioFrame falls back to a "coming soon" card for it rather than the
 *  whole app refusing to launch). Returns Universe's own URL, which is what the main window
 *  actually loads. */
async function spawnPackagedServers(): Promise<string> {
  const universe = await spawnNextServer({
    resourceName: "universe",
    logLabel: "[universe]",
    // MUST be stable across launches, not a random OS-assigned port: the renderer's origin
    // (http://127.0.0.1:PORT) is what every `localStorage`-backed setting is scoped to —
    // installed apps, wallpaper, theme, pinned taskbar apps, icon layout, shell mode, all of it.
    // A different port every launch silently wiped every one of them on restart (confirmed: the
    // exact bug reported as "installed apps disappear when I close and reopen"). 3000 matches
    // Universe's own `pnpm dev` port for the same reason bp below uses 3001.
    preferredPort: 3000,
    extraEnv: {
      VEASNA_WORKSPACE_ROOT: workspaceRoot(),
      // RIXIE_MEMORY_DB redirected to the same real, visible, writable workspace folder — NOT the
      // dev machine's own absolute path from .env.local. Set once at fork time (unlike the API
      // key, this isn't expected to change without a restart). Any real API key comes from an
      // optional user-created Documents/Veasna OS/rixie.env — the route itself re-reads that file
      // per-request too, this is just a fallback for the very first request before it's read.
      RIXIE_MEMORY_DB: path.join(workspaceRoot(), "rixie-memory.db"),
      ...loadRixieEnv(),
    },
  });
  stopFns.push(universe.stop);

  try {
    const bp = await spawnNextServer({
      resourceName: "bp",
      logLabel: "[bp]",
      // Same port bp's own `pnpm dev` uses — see pickFreePort.ts's comment for why a stable port
      // matters (browser localStorage is scoped to it).
      preferredPort: 3001,
    });
    stopFns.push(bp.stop);
    studioUrls.bp = bp.url;
  } catch (err) {
    console.error("BP Studio failed to start:", err);
  }

  try {
    const gamedev = await serveStaticDir(path.join(process.resourcesPath, "gamedev"), "[gamedev]", 5173);
    stopFns.push(gamedev.stop);
    studioUrls.gamedev = gamedev.url;
  } catch (err) {
    console.error("Game Dev Studio failed to start:", err);
  }

  return universe.url;
}

async function launch() {
  // !app.isPackaged is Electron's own built-in signal for "running from source, not a built
  // installer" — no custom env flag needed. In dev this loads straight against the developer's
  // already-running `pnpm dev` (port 3000), getting full Next.js hot reload for free, viewed
  // through an Electron window instead of a browser tab — bp/gamedev, if needed, come from their
  // own separately-run `pnpm dev:bp`/`pnpm dev:gamedev` on their well-known fixed ports exactly as
  // `CELESTIAL_BODIES`' hardcoded launchUrls already assume. In a packaged build there is no
  // `pnpm dev` (or dev:bp/dev:gamedev) to point at, so all three bundled servers get spawned here
  // instead, each on its own dynamically chosen loopback port.
  const serverUrl = app.isPackaged ? await spawnPackagedServers() : "http://localhost:3000";

  const win = createMainWindow();
  // No real update feed to check in dev mode (nothing published from a local, unbuilt checkout).
  if (app.isPackaged) setupAutoUpdater(win, stopAllServers);
  await win.loadURL(serverUrl);
}

app.whenReady().then(() => {
  launch().catch((err) => {
    console.error("Failed to launch Veasna OS:", err);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    launch().catch((err) => console.error("Failed to relaunch Veasna OS window:", err));
  }
});

// Otherwise the forked/served studio servers outlive the Electron app on quit — or, worse, briefly
// SURVIVE it: `before-quit` firing doesn't mean the child processes have actually exited yet,
// `child.kill()` is fire-and-forget. Cached (not re-run) so both the before-quit handler below AND
// updater.ts's "updater:install" handler can call this and share the SAME in-flight stop, rather
// than racing two separate Promise.all(stopFns...) runs against the same already-killed children
// (whose 'exit' event only fires once — a second wait would just burn the full 3s timeout).
let stopAllServersPromise: Promise<void> | null = null;
function stopAllServers(): Promise<void> {
  if (!stopAllServersPromise) {
    stopAllServersPromise = Promise.all(stopFns.map((stop) => stop())).then(() => undefined);
  }
  return stopAllServersPromise;
}

// This alone fixed a manual window-close/quit, but NOT Settings → OS Update: electron-updater's
// quitAndInstall() (see updater.ts) spawns the downloaded NSIS installer SYNCHRONOUSLY, before it
// gets around to calling app.quit() (one tick later) — so before-quit firing here was already too
// late. The installer's own "close the running app" check ran against an app plus two forked
// Next.js servers (all sharing this same exe image) that hadn't been told to quit yet, which is
// what actually produced NSIS's "Veasna OS cannot be closed" prompt specifically on update (a
// manual close-then-reinstall never hit this, since this handler already had time to run first).
// updater.ts now awaits stopAllServers() itself before ever calling quitAndInstall() — this
// handler stays as the fallback for every OTHER way the app can quit (window close, Alt+F4, etc).
let hasCleanedUp = false;
app.on("before-quit", (event) => {
  if (hasCleanedUp) return;
  event.preventDefault();
  stopAllServers().finally(() => {
    hasCleanedUp = true;
    app.quit();
  });
});
