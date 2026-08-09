import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { createMainWindow } from "./windows/createMainWindow";
import { spawnNextServer } from "./server/spawnNextServer";
import { serveStaticDir } from "./server/serveStaticDir";
import { loadBpEnv, getApiKeyStatus, setApiKey, RixieProvider } from "./server/bpEnvFile";
import { setupAutoUpdater } from "./updater";

const stopFns: (() => void)[] = [];
let bpStop: (() => void) | null = null;
let mainWindow: BrowserWindow | null = null;

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

/** BP Studio is started (and, after a new API key is saved, RE-started) separately from Universe
 *  and Game Dev Studio — its env vars can change at runtime (see settings:set-api-key below),
 *  which the other two never need. */
async function startBp(): Promise<void> {
  const bp = await spawnNextServer({
    resourceName: "bp",
    logLabel: "[bp]",
    // RIXIE_MEMORY_DB redirected to the same real, visible, writable workspace folder Universe
    // uses — NOT the dev machine's own absolute path from studios/bp/.env.local. Any real API key
    // comes from an optional user-created Documents/Veasna OS/bp.env (written by the Settings UI's
    // "settings:set-api-key" handler below), never from the dev machine's own .env.local (which
    // the packaging step refuses to ship in the first place).
    extraEnv: { RIXIE_MEMORY_DB: path.join(workspaceRoot(), "rixie-memory.db"), ...loadBpEnv() },
  });
  bpStop = bp.stop;
  studioUrls.bp = bp.url;
}

ipcMain.handle("settings:get-api-key-status", () => getApiKeyStatus());

ipcMain.handle("settings:set-api-key", async (_event, provider: RixieProvider, apiKey: string) => {
  setApiKey(provider, apiKey);
  // The new key only takes effect for a FRESH fork (env vars are read once, at process start) —
  // restart BP Studio's server in place rather than requiring the whole app to restart, then tell
  // the renderer its URL changed so any open BP Studio/Rixie window reloads against the new one.
  bpStop?.();
  await startBp().catch((err) => console.error("Failed to restart BP Studio after saving API key:", err));
  mainWindow?.webContents.send("studios:urls-changed");
});

/** Spawns Universe (the actual OS shell — must work) plus, best-effort, BP Studio and Game Dev
 *  Studio (bundled but non-critical: if either fails to start, Window.tsx's StudioFrame falls
 *  back to a "coming soon" card for it rather than the whole app refusing to launch). Returns
 *  Universe's own URL, which is what the main window actually loads. */
async function spawnPackagedServers(): Promise<string> {
  const universe = await spawnNextServer({
    resourceName: "universe",
    logLabel: "[universe]",
    extraEnv: { VEASNA_WORKSPACE_ROOT: workspaceRoot() },
  });
  stopFns.push(universe.stop);

  try {
    await startBp();
    stopFns.push(() => bpStop?.());
  } catch (err) {
    console.error("BP Studio failed to start:", err);
  }

  try {
    const gamedev = await serveStaticDir(path.join(process.resourcesPath, "gamedev"), "[gamedev]");
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
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  // No real update feed to check in dev mode (nothing published from a local, unbuilt checkout).
  if (app.isPackaged) setupAutoUpdater(win);
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

// Otherwise the forked/served studio servers outlive the Electron app on quit.
app.on("before-quit", () => {
  for (const stop of stopFns) stop();
});
