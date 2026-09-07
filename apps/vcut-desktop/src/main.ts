import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { createMainWindow } from "./windows/createMainWindow";
import { spawnNextServer } from "./server/spawnNextServer";

const stopFns: (() => Promise<void>)[] = [];
let mainWindow: BrowserWindow | null = null;

// The desktop half of sign-in: no Stripe/Supabase wiring lives in this app at all (see
// `packages/vcut/src/api/billing.ts`'s own doc comment) — this only needs to get a real Supabase
// session INTO the renderer, the same way a browser tab gets one from `studios/vcut/app/login`'s own
// magic-link/OAuth flow. The standard desktop pattern (VS Code, GitHub CLI, Slack desktop all use
// this): open the hosted login page in the user's OWN browser (so an already-logged-in Google session
// there just works, and Electron's embedded Chromium never has to carry the user's real browser
// credentials), have it redirect to a custom protocol on success, and catch that redirect here.
//
// Registering `vcut://` only matters for a PACKAGED build — `setAsDefaultProtocolClient` in dev would
// register whatever's currently running `electron .` (a node_modules binary, not a real installed
// app) as the OS-wide handler for this scheme, which breaks the moment that dev session ends. Signing
// in during `pnpm dev` isn't supported by this flow; test it against a packaged build instead.
const AUTH_PROTOCOL = "vcut";
if (app.isPackaged) app.setAsDefaultProtocolClient(AUTH_PROTOCOL);

/** Pulls `access_token`/`refresh_token` out of a `vcut://auth-callback#access_token=...&refresh_token=...`
 *  URL (the hash fragment, matching Supabase's own OAuth-redirect convention — see
 *  `studios/vcut/app/login/page.tsx`'s `?desktop=1` branch, which builds this exact URL) and forwards
 *  them to the renderer, which is the one place that actually holds a Supabase client (`getSupabase
 *  BrowserClient` — this main process never touches Supabase directly). Silently does nothing for any
 *  URL that isn't this specific callback shape, since `open-url`/`second-instance` can fire for other
 *  reasons (a second app launch with no protocol URL at all).
 */
function handleAuthCallbackUrl(url: string): void {
  if (!url.startsWith(`${AUTH_PROTOCOL}://auth-callback`)) return;
  const hash = url.split("#")[1] ?? "";
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return;
  mainWindow?.webContents.send("auth:callback", { accessToken, refreshToken });
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
    const url = argv.find((arg) => arg.startsWith(`${AUTH_PROTOCOL}://`));
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
  const server = await spawnNextServer({ VEASNA_WORKSPACE_ROOT: workspaceRoot() });
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
  const startupUrl = process.argv.find((arg) => arg.startsWith(`${AUTH_PROTOCOL}://`));
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
