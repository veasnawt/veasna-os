import { BrowserTab } from "../components/BrowserPanel";

export interface BrowserSession {
  tabs: BrowserTab[];
  activeTabId: string;
}

const STORAGE_KEY = "veasna-os:browser-session";

/** Everything in a `BrowserTab` (id/history/historyIndex/reloadTick) is plain data — no live
 *  connection, loading state, or webview reference to worry about invalidating on restore, so a
 *  loose shape check here is enough. Falls back to `null` (caller decides the default) rather than
 *  a hardcoded fresh session, since only VeasnaShell knows what a fresh session should look like
 *  (desktop vs. web default URL). */
export function loadBrowserSession(): BrowserSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.activeTabId !== "string" ||
      !Array.isArray(parsed.tabs) ||
      parsed.tabs.length === 0 ||
      !parsed.tabs.every(
        (t: unknown): t is BrowserTab =>
          !!t &&
          typeof (t as BrowserTab).id === "string" &&
          Array.isArray((t as BrowserTab).history) &&
          (t as BrowserTab).history.length > 0 &&
          typeof (t as BrowserTab).historyIndex === "number"
      )
    ) {
      return null;
    }
    // A tab whose saved historyIndex somehow points outside its own history (shouldn't happen,
    // but this is user-editable localStorage) gets clamped rather than trusted blindly.
    const tabs: BrowserTab[] = parsed.tabs.map((t: BrowserTab) => ({
      ...t,
      historyIndex: Math.min(Math.max(0, t.historyIndex), t.history.length - 1),
      reloadTick: 0,
    }));
    const activeTabId = tabs.some((t) => t.id === parsed.activeTabId) ? parsed.activeTabId : tabs[0].id;
    return { tabs, activeTabId };
  } catch {
    return null;
  }
}

export function saveBrowserSession(session: BrowserSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage full/unavailable — losing session-restore is a minor degradation, not worth surfacing.
  }
}
