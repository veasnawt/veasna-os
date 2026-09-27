import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** The one Supabase client a browser tab needs — created lazily (not at module load) so importing
 *  this file has no effect in an environment that never actually calls into it (SSR, a build that
 *  doesn't set the env vars at all, e.g. desktop's own bundled build — see this function's own env
 *  check below). Memoized per tab: Supabase's own client keeps a live session/token-refresh timer
 *  internally, and constructing a second one would just duplicate that for no benefit. */
let cached: SupabaseClient | null = null;

/** Kept in sync via `onAuthStateChange` below, purely so `getCachedAccessToken()` can return
 *  *something* synchronously — see that function's own doc comment for why a sync accessor exists
 *  at all alongside the async `getAccessToken()`. */
let cachedAccessToken: string | null = null;
let sessionUnavailable = false;
let refreshing: Promise<string | null> | null = null;
export const SESSION_REQUIRED_EVENT = "vcut-session-required";
export function isSessionUnavailable(): boolean { return sessionUnavailable; }
function requireSignIn(token: string | null): void {
  // An older request must not invalidate a newer sign-in or token refresh.
  if (!token || cachedAccessToken !== token) return;
  sessionUnavailable = true;
  cachedAccessToken = null;
  window.dispatchEvent(new Event(SESSION_REQUIRED_EVENT));
}

/** `null` when Supabase isn't configured for this build — the ONLY thing that distinguishes a
 *  "hosted" build (real accounts, `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` set at
 *  build time) from every other build of this same shared editor code (desktop's bundled server,
 *  local dev, the native mobile shell) where these env vars are simply never set. Every caller treats
 *  `null` as "accounts aren't a thing here" rather than throwing — see `packages/vcut/src/api/
 *  client.ts`'s own `apiFetch` for the one real caller. */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const bridge = (window as unknown as { veasnaAuth?: { storage?: { getItem(key: string): Promise<string | null>; canMigrate(key: string): Promise<boolean>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> } } }).veasnaAuth?.storage;
  const storage = bridge ? {
    async getItem(key: string) {
      const stored = await bridge.getItem(key);
      if (stored !== null) return stored;
      if (!await bridge.canMigrate(key)) return null;
      const legacy = window.localStorage.getItem(key);
      if (legacy !== null) { await bridge.setItem(key, legacy); window.localStorage.removeItem(key); }
      return legacy;
    },
    async setItem(key: string, value: string) { await bridge.setItem(key, value); window.localStorage.removeItem(key); },
    async removeItem(key: string) { await bridge.removeItem(key); window.localStorage.removeItem(key); },
  } : undefined;
  cached = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, ...(storage ? { storage } : {}) } });
  // Keeps `cachedAccessToken` current across sign-in, sign-out, and Supabase's own automatic token
  // refresh — fired once immediately with whatever the client already knows (including "nothing yet"
  // while the initial session check is still in flight), then again on every subsequent change.
  cached.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "SIGNED_OUT") sessionUnavailable = false;
    cachedAccessToken = sessionUnavailable ? null : session?.access_token ?? null;
  });
  // Confirmed a real, reported bug: Supabase's own client stops its auto-refresh ticker while the tab
  // is hidden (`visibilitychange`), so `cachedAccessToken` can sit stale for however long the tab spent
  // backgrounded — a real video editor left open in another tab for a while, easily past the access
  // token's own real lifetime. The FIRST render after switching back (a thumbnail's `<img src>`, an
  // export's `EventSource` reconnecting) would otherwise fire with that stale value immediately,
  // producing a genuine 401 the user sees as "session expired" despite having just been actively using
  // the tab moments before switching away. `getSession()` checks real expiry and refreshes through
  // Supabase's own logic if needed (see `getAccessToken`'s own doc comment) — its result isn't used
  // directly here; the point is only to update `cachedAccessToken` (via the `onAuthStateChange` this
  // triggers on an actual refresh) BEFORE anything else on this now-visible tab gets a chance to build
  // a URL with the stale one still sitting there.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        if (sessionUnavailable) void getAccessToken(true).catch(() => {});
        else void cached?.auth.getSession();
      }
    });
    window.addEventListener("online", () => { if (sessionUnavailable) void getAccessToken(true).catch(() => {}); });
  }
  return cached;
}

/** The current tab's access token, if any — `null` covers both "Supabase isn't configured for this
 *  build" and "configured, but nobody's signed in yet", which every caller treats identically (skip
 *  attaching an `Authorization` header; the server-side gate decides what that means for the request,
 *  not this function). */
export async function getAccessToken(forceRefresh = false): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  if (forceRefresh) {
    if (!refreshing) {
      refreshing = supabase.auth.refreshSession().then(({ data }) => data.session?.access_token ?? null).finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  if (sessionUnavailable) return null;
  const { data } = await supabase.auth.getSession();
  return sessionUnavailable ? null : data.session?.access_token ?? null;
}

/** Authenticated API calls retry a rejected token once with a forced refresh. Local filesystem
 * requests must keep using plain fetch; this helper is for protected account/cloud endpoints. */
export async function sessionFetch(input: string, init?: RequestInit): Promise<Response> {
  let token = await getAccessToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response = await fetch(input, { ...init, headers });
  if (response.status !== 401 || !token) return response;
  const fresh = await getAccessToken(true).catch(() => null);
  if (fresh) {
    token = fresh;
    headers.set("Authorization", `Bearer ${fresh}`);
    response = await fetch(input, { ...init, headers });
  }
  if (response.status === 401) requireSignIn(token);
  return response;
}

/** A synchronous, best-effort version of `getAccessToken()` above — for the one class of caller that
 *  genuinely cannot await one: `packages/vcut/src/api/client.ts`'s `mediaUrl` and its wrappers build
 *  plain URL strings for `<video src>`/`<img src>`/`<audio src>`, computed synchronously during
 *  render, with nowhere to put an awaited value. Ensures `getSupabaseBrowserClient()` has been called
 *  at least once first (so the `onAuthStateChange` subscription that keeps this fresh actually
 *  exists) — safe to call before sign-in completes, just returns `null` until the first auth state
 *  event fires, same as every other "not configured or not signed in yet" case in this file. */
export function getCachedAccessToken(): string | null {
  getSupabaseBrowserClient();
  return cachedAccessToken;
}
