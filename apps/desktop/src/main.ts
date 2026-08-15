import { app, BrowserWindow, ipcMain, Menu } from "electron";
import path from "node:path";
import { execFile } from "node:child_process";
import { createMainWindow } from "./windows/createMainWindow";
import { spawnNextServer } from "./server/spawnNextServer";
import { serveStaticDir } from "./server/serveStaticDir";
import { loadRixieEnv, getApiKeyStatus, setApiKey, setActiveProvider, setModel, RixieProvider } from "./server/rixieEnvFile";
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

// The Browser studio's <webview> (packages/universe's BrowserPanel.tsx) has no context menu at
// all by default — Electron doesn't give a <webview> guest one for free the way a real browser tab
// gets from Chrome itself. Right-click "Inspect Element" specifically needs main-process
// involvement: `contents.inspectElement(x, y)` only exists on the guest's own WebContents, which
// is only reachable here (a renderer-side `context-menu` DOM listener on the <webview> element
// can't reach it). Registered for every <webview> guest that ever gets created, not just Browser's
// — InstalledAppWindow.tsx (packages/universe) also renders one, and there's no cheap way to tell
// them apart here, but the same right-click menu makes sense for both.
app.on("web-contents-created", (_event, contents) => {
  if (contents.getType() !== "webview") return;
  contents.on("context-menu", (_e, params) => {
    const template: Electron.MenuItemConstructorOptions[] = [];
    if (params.linkURL) {
      template.push({ label: "Copy Link Address", click: () => contents.executeJavaScript(`navigator.clipboard.writeText(${JSON.stringify(params.linkURL)})`).catch(() => {}) });
      template.push({ type: "separator" });
    }
    if (params.selectionText) {
      template.push({ label: "Copy", click: () => contents.copy() });
    }
    if (params.isEditable) {
      template.push({ label: "Cut", click: () => contents.cut(), enabled: params.editFlags.canCut });
      template.push({ label: "Copy", click: () => contents.copy(), enabled: params.editFlags.canCopy });
      template.push({ label: "Paste", click: () => contents.paste(), enabled: params.editFlags.canPaste });
    }
    if (template.length > 0) template.push({ type: "separator" });
    template.push({ label: "Reload", click: () => contents.reload() });
    template.push({ label: "Inspect Element", click: () => contents.inspectElement(params.x, params.y) });
    Menu.buildFromTemplate(template).popup();
  });
});

ipcMain.handle("settings:get-api-key-status", () => getApiKeyStatus());

// Rixie's chat lives in Universe's own /api/agent route now (moved from BP Studio), which reads
// Documents/Veasna OS/rixie.env fresh on every request — no server restart needed for a newly
// saved key to take effect, unlike when this lived in BP Studio and required killing and
// re-forking its whole server.
ipcMain.handle("settings:set-api-key", (_event, provider: RixieProvider, apiKey: string) => {
  setApiKey(provider, apiKey);
});

// Switches the active provider without touching any saved key — lets Settings offer "switch back
// to a provider you already configured" with no re-typing needed.
ipcMain.handle("settings:set-active-provider", (_event, provider: RixieProvider) => {
  setActiveProvider(provider);
});

// Sets (or, given an empty string, clears back to the smart per-provider default) an explicit
// model override FOR THAT SPECIFIC PROVIDER — lets Settings offer a model a provider just
// released without a Veasna OS update, without risking a stale model name once you switch
// providers (each provider remembers its own choice independently).
ipcMain.handle("settings:set-model", (_event, provider: RixieProvider, model: string) => {
  setModel(provider, model);
});

// "Install Software" (packages/universe's DesktopContextMenu + InstallSoftwareDialog) — installs a
// real package via Windows' own built-in winget CLI, from a small curated catalog the renderer
// already knows the winget package IDs for (see installSoftwareCatalog.ts). Only meaningful inside
// a real desktop app (window.veasnaApps is undefined in a plain browser tab, see runtime.ts's
// getAppsBridge) — winget itself isn't reachable from a web page regardless.
//
// Deliberately execFile (array args, no shell) rather than exec/a shell string — even though
// wingetId always comes from our own fixed catalog today, not arbitrary user input, this avoids
// ever depending on that staying true. 10 minutes covers a slow download on a slow connection;
// winget itself has no useful progress-reporting hook to stream back mid-install.
ipcMain.handle("apps:winget-install", (_event, wingetId: string) => {
  return new Promise<{ status: "success" | "error"; message?: string }>((resolve) => {
    execFile(
      "winget",
      ["install", "--id", wingetId, "-e", "--silent", "--accept-package-agreements", "--accept-source-agreements"],
      { timeout: 10 * 60 * 1000 },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ status: "error", message: stderr.trim() || stdout.trim() || err.message });
        } else {
          resolve({ status: "success" });
        }
      }
    );
  });
});

/** Spawns Universe (the actual OS shell — must work, and now also hosts Rixie's chat) plus,
 *  best-effort, VStudio, BP Studio, and Game Dev Studio (bundled but non-critical: if any fails to
 *  start, Window.tsx's StudioFrame falls back to a "coming soon" card for it rather than the whole
 *  app refusing to launch). VStudio is both its own launchable studio (its `CelestialBody` entry in
 *  constants.ts has a `launchUrl`, resolved the same way bp's/gamedev's is) AND, separately, what
 *  bp's own Create page embeds via `<iframe>` — a failed VStudio spawn shouldn't take bp down with
 *  it, hence the try/catch here running independently of bp's own. Returns Universe's own URL, which
 *  is what the main window actually loads. */
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

  // VStudio spawned BEFORE bp: bp's own server needs VStudio's real (dynamically-assigned) URL at
  // its own spawn time, to hand to its Create page for the <iframe> it embeds VStudio through (see
  // studios/bp/app/api/vstudio-url/route.ts). bp's own client-side renderer can't resolve this the
  // way Universe resolves bp's own URL (via window.veasnaStudios) — that bridge isn't reachable from
  // inside bp's <webview> — so it's threaded through as an env var instead, same as RIXIE_MEMORY_DB.
  let vstudioUrl: string | undefined;
  try {
    const vstudio = await spawnNextServer({
      resourceName: "vstudio",
      logLabel: "[vstudio]",
      // Same port VStudio's own `pnpm dev` uses — see pickFreePort.ts's comment for why a stable
      // port matters (browser localStorage is scoped to it).
      preferredPort: 3002,
      extraEnv: { VEASNA_WORKSPACE_ROOT: workspaceRoot() },
    });
    stopFns.push(vstudio.stop);
    studioUrls.vstudio = vstudio.url;
    vstudioUrl = vstudio.url;
  } catch (err) {
    console.error("VStudio failed to start:", err);
  }

  try {
    const bp = await spawnNextServer({
      resourceName: "bp",
      logLabel: "[bp]",
      // Same port bp's own `pnpm dev` uses — see pickFreePort.ts's comment for why a stable port
      // matters (browser localStorage is scoped to it).
      preferredPort: 3001,
      ...(vstudioUrl ? { extraEnv: { VSTUDIO_URL: vstudioUrl } } : {}),
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
