export interface LocalApp {
  /** Always "localapp:<random>" — namespaced so it can never collide with a studio id, a real
   *  sandboxed file path, or an installed web app's "webapp:" id, all of which share the same
   *  desktop icon `order`/`entries` list. */
  id: string;
  name: string;
  /** Real filesystem path on the host machine. Only ever meaningful inside the packaged Electron
   *  app — that's the only place "Add Local App" exists at all (see runtime.ts's getAppsBridge). */
  path: string;
  color: string;
  /** Native file icon extracted at install time (a data: URL) — undefined if extraction failed,
   *  in which case the desktop icon falls back to a generic glyph. */
  iconDataUrl?: string;
}

const STORAGE_KEY = "veasna-os:local-apps";

const PALETTE = ["#38bdf8", "#a78bfa", "#f472b6", "#fb923c", "#34d399", "#facc15", "#f87171", "#60a5fa"];

/** Deterministic, not random — the same name always gets the same color across reloads without
 *  needing to persist a separate field for it. */
function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function loadLocalApps(): LocalApp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalApps(apps: LocalApp[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
}

export function installLocalApp(name: string, path: string, iconDataUrl?: string): LocalApp {
  const app: LocalApp = {
    id: `localapp:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    name,
    path,
    color: colorForName(name),
    iconDataUrl,
  };
  saveLocalApps([...loadLocalApps(), app]);
  return app;
}

export function uninstallLocalApp(id: string): void {
  saveLocalApps(loadLocalApps().filter((a) => a.id !== id));
}
