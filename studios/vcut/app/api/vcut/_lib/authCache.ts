/** Tiny in-memory caches for the two lookups every hosted request repeats — pure (clock injected) so they can be
 *  unit-tested.
 *
 *  Every hosted media request (each `<video>` range request, thumbnail, waveform...) used to make TWO network
 *  round trips before serving a byte: `supabase.auth.getUser(token)` to verify the session, then a
 *  `projects_index` query to check the project's owner. A page loading a timeline fires dozens of these in a
 *  burst. The answers barely change, so they are remembered briefly:
 *
 *  - a verified session for at most `SESSION_TTL_MS` (and never past the token's own expiry) — signing out or
 *    revoking a session elsewhere can therefore take up to this long to reach media requests;
 *  - a confirmed project ownership for at most `OWNERSHIP_TTL_MS`. Only POSITIVE results are cached: a refusal
 *    is never remembered, so a project that was just created (its index row landing a moment after) or an
 *    ownership that just changed is picked up on the very next request.
 *
 *  Keys are never the raw token: it is hashed first, so a heap dump or a stray log of the cache can't leak
 *  bearer tokens. */

export const SESSION_TTL_MS = 30_000;
export const OWNERSHIP_TTL_MS = 60_000;
const MAX_ENTRIES = 5_000;

export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(options: { now?: () => number; maxEntries?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.maxEntries = options.maxEntries ?? MAX_ENTRIES;
  }

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    if (ttlMs <= 0) return;
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) this.evict();
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  /** Removes every entry whose key satisfies `predicate` (e.g. all cached ownerships of one project). */
  deleteWhere(predicate: (key: string) => boolean): void {
    for (const key of [...this.entries.keys()]) if (predicate(key)) this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Drops expired entries first; if the cache is still full, drops the oldest-inserted. */
  private evict(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

/** A JWT's `exp` in ms since the epoch, or `null` if it can't be read. Used only to stop a cached session
 *  outliving its token — the token itself is still verified by Supabase on the first (uncached) request. */
export function jwtExpiryMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** How long a session verified now may be cached: the standard TTL, cut short if the token expires sooner. */
export function sessionCacheTtlMs(token: string, nowMs: number): number {
  const expiry = jwtExpiryMs(token);
  if (expiry === null) return SESSION_TTL_MS;
  return Math.max(0, Math.min(SESSION_TTL_MS, expiry - nowMs));
}

/** A non-reversible cache key for a bearer token. */
export async function tokenKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Buffer.from(digest).toString("base64");
}
