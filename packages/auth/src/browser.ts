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
  cached = createClient(url, anonKey);
  // Keeps `cachedAccessToken` current across sign-in, sign-out, and Supabase's own automatic token
  // refresh — fired once immediately with whatever the client already knows (including "nothing yet"
  // while the initial session check is still in flight), then again on every subsequent change.
  cached.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token ?? null;
  });
  return cached;
}

/** The current tab's access token, if any — `null` covers both "Supabase isn't configured for this
 *  build" and "configured, but nobody's signed in yet", which every caller treats identically (skip
 *  attaching an `Authorization` header; the server-side gate decides what that means for the request,
 *  not this function). */
export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
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
