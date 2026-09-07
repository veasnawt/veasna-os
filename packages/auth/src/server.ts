import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SessionUser {
  id: string;
  email: string | null;
}

/** The service-role client — full read/write against this Supabase project regardless of Postgres
 *  row-level-security policies, since a trusted server process (not a browser holding a user's own
 *  anon-key session) is the one making these calls. Never send `SUPABASE_SERVICE_ROLE_KEY` to a
 *  browser; only `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `browser.ts`) is safe there. Lazily created and
 *  memoized for the same reason as `browser.ts`'s own client — importing this module has no effect
 *  until something actually calls in. */
let cached: SupabaseClient | null = null;

/** Throws rather than returning `null`, unlike `browser.ts`'s equivalent — a SERVER route deciding to
 *  call this at all already means it's running in hosted mode (see `studios/vcut`'s own
 *  `VCUT_HOSTED`-gated call sites), where missing credentials are a real misconfiguration to fail
 *  loudly on, not a normal "accounts aren't a thing here" state the way an unconfigured browser
 *  build is. */
export function getSupabaseAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are not set — this server route requires them in hosted mode.");
  }
  cached = createClient(url, serviceKey, { auth: { persistSession: false } });
  return cached;
}

/** Verifies a bearer token against Supabase and returns the user it belongs to, or `null` for
 *  anything invalid/expired/malformed — deliberately not distinguishing WHY (an attacker probing
 *  which failure mode leaked which detail learns nothing extra from a uniform "not authenticated"). */
export async function getSessionUser(bearerToken: string): Promise<SessionUser | null> {
  if (!bearerToken) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.getUser(bearerToken);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
