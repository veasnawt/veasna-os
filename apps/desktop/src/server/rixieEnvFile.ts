import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export type RixieProvider = "anthropic" | "openai" | "gemini" | "groq";

// Matches studios/universe/app/api/agent/route.ts's own documented variable names exactly
// (originally studios/bp/.env.example's, from before Rixie's chat moved into Universe).
const PROVIDER_KEY_VAR: Record<RixieProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
};

function rixieEnvPath(): string {
  return path.join(app.getPath("documents"), "Veasna OS", "rixie.env");
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

/** Reads an OPTIONAL, user-created `KEY=VALUE` file at Documents/Veasna OS/rixie.env for Rixie's
 *  chat credentials — deliberately NEVER a dev machine's own .env.local (which
 *  build-resources.mjs's packaging step explicitly refuses to ship in the first place, since it
 *  holds a real, live secret). Returns {} if the file doesn't exist, so Rixie still starts fine
 *  without one — her own chat UI already shows a clear "API key is missing" error inline rather
 *  than crashing. Also read directly (not just here) by studios/universe/app/api/agent/route.ts
 *  itself, on every request — so saving a new key in Settings takes effect on the very next
 *  message with no server restart needed. */
export function loadRixieEnv(): Record<string, string> {
  const envPath = rixieEnvPath();
  if (!fs.existsSync(envPath)) return {};
  return parseEnvFile(fs.readFileSync(envPath, "utf-8"));
}

export interface RixieKeyStatus {
  activeProvider: RixieProvider;
  /** Whether a key is saved for EACH provider, not just the active one — setApiKey merges rather
   *  than replaces (see below), so switching providers doesn't lose earlier ones, and the
   *  Settings UI needs to know which ones are already usable without asking the user to re-paste
   *  a key it already has on disk. */
  configured: Record<RixieProvider, boolean>;
}

/** Never returns any key value itself — the renderer's Settings UI only ever needs to know
 *  "configured or not" per provider, not the actual secret, so it's never sent back across the
 *  IPC bridge once saved. */
export function getApiKeyStatus(): RixieKeyStatus {
  const env = loadRixieEnv();
  const activeProvider = (env.RIXIE_PROVIDER as RixieProvider) || "anthropic";
  const configured = Object.fromEntries(
    (Object.keys(PROVIDER_KEY_VAR) as RixieProvider[]).map((p) => [p, Boolean(env[PROVIDER_KEY_VAR[p]]?.trim())])
  ) as Record<RixieProvider, boolean>;
  return { activeProvider, configured };
}

function writeRixieEnv(values: Record<string, string>): void {
  const envPath = rixieEnvPath();
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf-8");
}

/** Writes (merging with, not replacing, whatever's already there — e.g. a hand-edited
 *  RIXIE_MODEL, or another provider's already-saved key, survives) the provider + API key into
 *  Documents/Veasna OS/rixie.env, and makes it the active provider. No server restart needed —
 *  the agent route reads this file fresh on every chat request. */
export function setApiKey(provider: RixieProvider, apiKey: string): void {
  const existing = loadRixieEnv();
  existing.RIXIE_PROVIDER = provider;
  existing[PROVIDER_KEY_VAR[provider]] = apiKey.trim();
  writeRixieEnv(existing);
}

/** Switches the active provider WITHOUT touching any stored key — for the common case where the
 *  user already saved a key for this provider earlier and just wants to switch back to it. */
export function setActiveProvider(provider: RixieProvider): void {
  const existing = loadRixieEnv();
  existing.RIXIE_PROVIDER = provider;
  writeRixieEnv(existing);
}
