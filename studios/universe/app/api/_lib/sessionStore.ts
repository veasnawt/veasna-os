import { SessionStore } from "@veasna/ai";

/** Matches @veasna/ai's own config.ts resolution (RixieAgent's constructor default) — SessionStore
 *  itself has no env-aware default of its own (just a hardcoded relative path), so every direct
 *  instantiation has to repeat this fallback chain to land on the SAME db file RixieAgent (and the
 *  desktop app's RIXIE_MEMORY_DB) actually uses. Shared by /api/agent (title touch-up) and
 *  /api/agent/sessions (list/delete) rather than duplicated in both route files. */
export function getSessionStore(): SessionStore {
  const dbPath = process.env.RIXIE_MEMORY_DB || process.env.VEASNA_MEMORY_DB || "./core/data/memory.db";
  return new SessionStore(dbPath);
}
