import fs from "fs";
import path from "path";

export type RixieProvider = "anthropic" | "openai" | "gemini";

// Matches studios/universe/app/api/agent/route.ts's own documented variable names, and
// apps/desktop/src/server/rixieEnvFile.ts's copy of the same map (that one can't import this file
// directly — it needs Electron's `app.getPath`, which doesn't exist outside the desktop app).
const PROVIDER_KEY_VAR: Record<RixieProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

/** Documents/Veasna OS/rixie.env in the packaged desktop app (VEASNA_WORKSPACE_ROOT set by
 *  apps/desktop/src/main.ts when it forks this server); a gitignored file inside this checkout
 *  when running via `pnpm dev`/a plain browser tab instead (no VEASNA_WORKSPACE_ROOT there) — same
 *  format, same "read fresh on every request, no restart needed" behavior either way, just a
 *  dev-machine-local file instead of a real user-visible one. Deliberately its OWN file, never
 *  `.env.local` — that file can hold other unrelated dev config a UI shouldn't silently rewrite,
 *  and build-resources.mjs explicitly refuses to ship it in a packaged build in the first place. */
function rixieEnvPath(): string {
  const workspaceRoot = process.env.VEASNA_WORKSPACE_ROOT;
  return workspaceRoot ? path.join(workspaceRoot, "rixie.env") : path.join(process.cwd(), ".env.rixie");
}

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

/** Reads the optional override file — returns {} if it doesn't exist, so Rixie still starts fine
 *  without one (falls through to plain process.env, same as always). Read fresh on every call, by
 *  design: this is what makes saving a new key in Settings take effect on the very next chat
 *  message with no server restart. */
export function loadRixieEnv(): Record<string, string> {
  const envPath = rixieEnvPath();
  if (!fs.existsSync(envPath)) return {};
  return parseEnvFile(fs.readFileSync(envPath, "utf-8"));
}

/** Whether a real key is currently configured for the active provider — never the key itself, so
 *  the Settings UI only ever learns "configured or not," not the actual secret. */
export function getApiKeyStatus(): { provider: RixieProvider; hasKey: boolean } {
  const env = loadRixieEnv();
  const provider = (env.RIXIE_PROVIDER as RixieProvider) || "anthropic";
  const keyVar = PROVIDER_KEY_VAR[provider] ?? PROVIDER_KEY_VAR.anthropic;
  return { provider, hasKey: Boolean(env[keyVar]?.trim()) };
}

/** Merges with (never replaces) whatever's already in the file — a hand-edited RIXIE_MODEL or
 *  RIXIE_MAX_TOKENS survives a Settings save untouched. */
export function setApiKey(provider: RixieProvider, apiKey: string): void {
  const envPath = rixieEnvPath();
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const existing = loadRixieEnv();
  existing.RIXIE_PROVIDER = provider;
  existing[PROVIDER_KEY_VAR[provider]] = apiKey.trim();
  const lines = Object.entries(existing).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf-8");
}
