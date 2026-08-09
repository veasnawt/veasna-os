import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export type RixieProvider = "anthropic" | "openai" | "gemini";

// Matches studios/bp/.env.example's own documented variable names exactly.
const PROVIDER_KEY_VAR: Record<RixieProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

function bpEnvPath(): string {
  return path.join(app.getPath("documents"), "Veasna OS", "bp.env");
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

/** Reads an OPTIONAL, user-created `KEY=VALUE` file at Documents/Veasna OS/bp.env for BP Studio's
 *  Rixie AI chat credentials — deliberately NEVER the dev machine's own studios/bp/.env.local
 *  (which build-resources.mjs's packaging step explicitly refuses to ship in the first place,
 *  since it holds a real, live secret). Returns {} if the file doesn't exist, so BP Studio still
 *  starts fine without one — its own chat UI already shows a clear "API key is missing" error
 *  inline rather than crashing. */
export function loadBpEnv(): Record<string, string> {
  const envPath = bpEnvPath();
  if (!fs.existsSync(envPath)) return {};
  return parseEnvFile(fs.readFileSync(envPath, "utf-8"));
}

/** Whether a real key is currently configured for the active provider — never returns the key
 *  value itself (the renderer's Settings UI only ever needs to know "configured or not", not the
 *  actual secret, so it's never sent back across the IPC bridge once saved). */
export function getApiKeyStatus(): { provider: RixieProvider; hasKey: boolean } {
  const env = loadBpEnv();
  const provider = (env.RIXIE_PROVIDER as RixieProvider) || "anthropic";
  const keyVar = PROVIDER_KEY_VAR[provider] ?? PROVIDER_KEY_VAR.anthropic;
  return { provider, hasKey: Boolean(env[keyVar]?.trim()) };
}

/** Writes (merging with, not replacing, whatever's already there — e.g. a hand-edited
 *  RIXIE_MODEL survives) the provider + API key into Documents/Veasna OS/bp.env. Caller is
 *  responsible for restarting BP Studio's forked server afterward for the new key to actually
 *  take effect (env vars are only read once, at fork time). */
export function setApiKey(provider: RixieProvider, apiKey: string): void {
  const envPath = bpEnvPath();
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const existing = loadBpEnv();
  const keyVar = PROVIDER_KEY_VAR[provider];
  existing.RIXIE_PROVIDER = provider;
  existing[keyVar] = apiKey.trim();
  const lines = Object.entries(existing).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf-8");
}
