import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { createMainWindow } from "./windows/createMainWindow";
import { spawnNextServer } from "./server/spawnNextServer";
import { installSessionStorage } from "./auth/sessionStorage";

const stopFns: (() => Promise<void>)[] = [];
let mainWindow: BrowserWindow | null = null;
let serverOrigin = "";
installSessionStorage(path.join(app.getPath("userData"), "auth-session.enc"), () => mainWindow, () => serverOrigin);

// The desktop half of sign-in: no Stripe/Supabase wiring lives in this app at all (see
// `packages/vcut/src/api/billing.ts`'s own doc comment) — this only needs to get a real Supabase
// session INTO the renderer, the same way a browser tab gets one from `studios/vcut/app/login`'s own
// magic-link/OAuth flow. The standard desktop pattern (VS Code, GitHub CLI, Slack desktop all use
// this): open the hosted login page in the user's OWN browser (so an already-logged-in Google session
// there just works, and Electron's embedded Chromium never has to carry the user's real browser
// credentials), have it redirect to a custom protocol on success, and catch that redirect here.
//
const AUTH_PROTOCOL = "vcut";
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(AUTH_PROTOCOL);
}

/** Pulls `access_token`/`refresh_token` out of a `vcut://auth-callback?access_token=...` or
 *  `#access_token=...` URL and forwards them to the renderer. Browsers (Chrome/Edge on Windows)
 *  strip hash fragments on external protocol launches, so query params are checked first.
 */
function handleAuthCallbackUrl(rawUrl: string): void {
  const url = rawUrl.trim().replace(/^["']|["']$/g, "");
  if (!url.startsWith(`${AUTH_PROTOCOL}://`)) return;

  let accessToken: string | null = null;
  let refreshToken: string | null = null;

  try {
    const parsed = new URL(url.replace(`${AUTH_PROTOCOL}://`, "https://dummy/"));
    accessToken = parsed.searchParams.get("access_token");
    refreshToken = parsed.searchParams.get("refresh_token");

    if (!accessToken || !refreshToken) {
      const hashStr = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
      const hashParams = new URLSearchParams(hashStr);
      accessToken = accessToken || hashParams.get("access_token");
      refreshToken = refreshToken || hashParams.get("refresh_token");
    }
  } catch {
    const queryPart = url.includes("?") ? url.split("?")[1].split("#")[0] : "";
    const hashPart = url.includes("#") ? url.split("#")[1] : "";
    const params = new URLSearchParams(queryPart || hashPart);
    accessToken = params.get("access_token");
    refreshToken = params.get("refresh_token");
  }

  if (!accessToken || !refreshToken) {
    console.error("[vcut] desktopAuth: missing access_token or refresh_token in callback URL:", url);
    return;
  }

  console.log("[vcut] desktopAuth: tokens received, forwarding to renderer");
  mainWindow?.webContents.send("auth:callback", { accessToken, refreshToken });
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show();
  mainWindow?.focus();
}

// Windows/Linux deliver a `vcut://` link by launching a SECOND instance of this app with the URL as
// a plain argv entry — `requestSingleInstanceLock` is what makes that second launch hand its argv to
// the FIRST (already-running) instance via `second-instance` instead of opening a redundant window.
// macOS never needs this: a custom-scheme link there fires `open-url` directly on the existing app.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = argv
      .map((arg) => arg.trim().replace(/^["']|["']$/g, ""))
      .find((arg) => arg.startsWith(`${AUTH_PROTOCOL}://`));
    if (url) handleAuthCallbackUrl(url);
  });
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleAuthCallbackUrl(url);
});

ipcMain.handle("auth:open-sign-in", () => {
  shell.openExternal("https://vcut.io/login?desktop=1");
});

// Same `Documents/Veasna OS` folder the full Veasna OS suite (apps/desktop) uses — deliberately
// shared, not a separate `Documents/VCut` folder: VCUT_ROOT ends up at
// `<workspaceRoot>/.vcut` regardless of which app spawned the server (see
// studios/vcut/app/api/vcut/_lib/paths.ts), so a project created in one app opens correctly
// in the other rather than each maintaining its own separate, invisible-to-the-other library.
function workspaceRoot(): string {
  return path.join(app.getPath("documents"), "Veasna OS");
}

async function spawnPackagedServer(): Promise<string> {
  const server = await spawnNextServer({ VEASNA_WORKSPACE_ROOT: workspaceRoot(), VCUT_EXPORTS_DIR: path.join(app.getPath("videos"), "VCut") });
  stopFns.push(server.stop);
  return server.url;
}

async function launch() {
  // !app.isPackaged is Electron's own built-in signal for "running from source, not a built
  // installer" — no custom env flag needed. In dev this loads straight against the developer's
  // already-running `pnpm dev:vcut` (port 3002), getting full Next.js hot reload for free,
  // viewed through an Electron window instead of a browser tab. In a packaged build there is no
  // `pnpm dev` to point at, so the bundled server gets spawned here instead, on its own
  // dynamically-chosen loopback port.
  const serverUrl = app.isPackaged ? await spawnPackagedServer() : "http://localhost:3002";
  serverOrigin = new URL(serverUrl).origin;

  const win = createMainWindow();
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  await win.loadURL(serverUrl);

  // Covers the case where the app wasn't already running when sign-in completed — the OS launches a
  // FRESH instance with the `vcut://` link as a startup argv entry (this is what `process.argv` holds
  // on a cold start; `second-instance`, wired above, only fires for an ALREADY-running instance).
  // Deferred until after `loadURL` resolves so the renderer's own `onCallback` listener (registered on
  // mount) is guaranteed to exist before this sends anything — sending earlier would silently drop it.
  const startupUrl = process.argv
    .map((arg) => arg.trim().replace(/^["']|["']$/g, ""))
    .find((arg) => arg.startsWith(`${AUTH_PROTOCOL}://`));
  if (startupUrl) handleAuthCallbackUrl(startupUrl);
}

app.whenReady().then(() => {
  launch().catch((err) => {
    console.error("Failed to launch VCut:", err);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    launch().catch((err) => console.error("Failed to relaunch VCut window:", err));
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
