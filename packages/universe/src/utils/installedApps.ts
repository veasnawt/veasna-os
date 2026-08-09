export interface InstalledApp {
  /** Always "webapp:<random>" — namespaced so it can never collide with a studio id or a real
   *  sandboxed file path, both of which share the same desktop icon `order`/`entries` list. */
  id: string;
  name: string;
  url: string;
  color: string;
}

const STORAGE_KEY = "veasna-os:installed-apps";

const PALETTE = ["#38bdf8", "#a78bfa", "#f472b6", "#fb923c", "#34d399", "#facc15", "#f87171", "#60a5fa"];

/** Deterministic, not random — the same name always gets the same color across reloads without
 *  needing to persist a separate field for it. */
function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function loadInstalledApps(): InstalledApp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveInstalledApps(apps: InstalledApp[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
}

/** Prepends `https://` when the user typed a bare domain (the common case) — a real scheme the
 *  user explicitly typed (including `http://` for a local/insecure site) is always left alone. */
export function normalizeAppUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function isValidAppUrl(rawUrl: string): boolean {
  try {
    const url = normalizeAppUrl(rawUrl);
    const parsed = new URL(url);
    return !!parsed.hostname;
  } catch {
    return false;
  }
}

export function installApp(name: string, rawUrl: string): InstalledApp {
  const url = normalizeAppUrl(rawUrl);
  const hostname = new URL(url).hostname;
  const app: InstalledApp = {
    id: `webapp:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || hostname,
    url,
    color: colorForName(name.trim() || url),
  };
  saveInstalledApps([...loadInstalledApps(), app]);
  return app;
}

export function uninstallApp(id: string): void {
  saveInstalledApps(loadInstalledApps().filter((a) => a.id !== id));
}

/** Google's public favicon service — far more reliable than assuming a bare `/favicon.ico` exists
 *  at the site's root (most real sites don't serve one there even when they have a favicon). Loads
 *  as a plain `<img src>`, which isn't subject to the CORS restrictions that only apply to reading
 *  pixel data back out (e.g. via canvas), so this works cross-origin with no extra plumbing. */
export function faviconUrl(url: string): string {
  const hostname = new URL(url).hostname;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
}
