/** Client-safe exports only — `./server.ts` (service-role key, never to reach a browser bundle) is
 *  deliberately NOT re-exported here. A single barrel covering both would put `useSession.ts`'s
 *  `useEffect`/`useState` in the same module graph as a plain server route import, which Next's RSC
 *  bundler rejects outright ("importing a module that depends on useEffect into a Server Component
 *  module") the moment any server file does `import { getSessionUser } from "@veasnawt/auth"` — this
 *  bit a real `studios/vcut/app/api/vcut/_lib/auth.ts` import and broke every page. Server code
 *  imports `@veasnawt/auth/server` instead; see that subpath's own file. */
export { getSupabaseBrowserClient, getAccessToken, getCachedAccessToken } from "./browser.ts";
export { useSupabaseSession, type SessionState } from "./useSession.ts";
