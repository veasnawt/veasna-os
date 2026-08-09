import { app, BrowserWindow, ipcMain } from "electron";
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

// Otherwise the forked/served studio servers outlive the Electron app on quit — or, worse, briefly
// SURVIVE it: `before-quit` firing doesn't mean the child processes have actually exited yet,
// `child.kill()` is fire-and-forget. That race is exactly what caused NSIS's "Veasna OS cannot be
// closed" prompt on update: electron-updater's quitAndInstall() (Settings → OS Update) could let
// the downloaded installer start overwriting files while a forked server was still winding down
// and still holding a lock on one. Fix: intercept the FIRST before-quit, actually wait for every
// server to confirm it exited (stop() now returns a Promise that does that — see
// spawnNextServer.ts/serveStaticDir.ts), then quit for real; `hasCleanedUp` lets that second,
// self-triggered quit through immediately instead of looping.
let hasCleanedUp = false;
app.on("before-quit", (event) => {
  if (hasCleanedUp) return;
  event.preventDefault();
  Promise.all(stopFns.map((stop) => stop())).finally(() => {
    hasCleanedUp = true;
    app.quit();
  });
});
