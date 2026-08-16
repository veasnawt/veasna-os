import { app, BrowserWindow } from "electron";
import path from "node:path";
import { createMainWindow } from "./windows/createMainWindow";
import { spawnNextServer } from "./server/spawnNextServer";

const stopFns: (() => Promise<void>)[] = [];

// Same `Documents/Veasna OS` folder the full Veasna OS suite (apps/desktop) uses — deliberately
// shared, not a separate `Documents/VStudio` folder: VSTUDIO_ROOT ends up at
// `<workspaceRoot>/.vstudio` regardless of which app spawned the server (see
// studios/vstudio/app/api/vstudio/_lib/paths.ts), so a project created in one app opens correctly
// in the other rather than each maintaining its own separate, invisible-to-the-other library.
function workspaceRoot(): string {
  return path.join(app.getPath("documents"), "Veasna OS");
}

async function spawnPackagedServer(): Promise<string> {
  const server = await spawnNextServer({ VEASNA_WORKSPACE_ROOT: workspaceRoot() });
  stopFns.push(server.stop);
  return server.url;
}

async function launch() {
  // !app.isPackaged is Electron's own built-in signal for "running from source, not a built
  // installer" — no custom env flag needed. In dev this loads straight against the developer's
  // already-running `pnpm dev:vstudio` (port 3002), getting full Next.js hot reload for free,
  // viewed through an Electron window instead of a browser tab. In a packaged build there is no
  // `pnpm dev` to point at, so the bundled server gets spawned here instead, on its own
  // dynamically-chosen loopback port.
  const serverUrl = app.isPackaged ? await spawnPackagedServer() : "http://localhost:3002";

  const win = createMainWindow();
  await win.loadURL(serverUrl);
}

app.whenReady().then(() => {
  launch().catch((err) => {
    console.error("Failed to launch VStudio:", err);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    launch().catch((err) => console.error("Failed to relaunch VStudio window:", err));
  }
});

// Otherwise the forked server outlives the Electron app on quit — or, worse, briefly SURVIVES it:
// `before-quit` firing doesn't mean the child process has actually exited yet, `child.kill()` is
// fire-and-forget. Cached (not re-run) so a repeated quit attempt can't race two separate
// Promise.all(stopFns...) runs against the same already-killed child.
let stopAllServersPromise: Promise<void> | null = null;
function stopAllServers(): Promise<void> {
  if (!stopAllServersPromise) {
    stopAllServersPromise = Promise.all(stopFns.map((stop) => stop())).then(() => undefined);
  }
  return stopAllServersPromise;
}

let hasCleanedUp = false;
app.on("before-quit", (event) => {
  if (hasCleanedUp) return;
  event.preventDefault();
  stopAllServers().finally(() => {
    hasCleanedUp = true;
    app.quit();
  });
});
