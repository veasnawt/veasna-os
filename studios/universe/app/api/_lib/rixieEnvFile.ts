import fs from "fs";
import path from "path";

export type RixieProvider = "anthropic" | "openai" | "gemini" | "groq" | "ollama";

// Matches studios/universe/app/api/agent/route.ts's own documented variable names, and
// apps/desktop/src/server/rixieEnvFile.ts's copy of the same map (that one can't import this file
// directly — it needs Electron's `app.getPath`, which doesn't exist outside the desktop app).
// "ollama"'s slot holds a base URL, not a secret — it runs locally, no API key involved — reusing
// this same map rather than a parallel one since the rest of this file already treats every
// provider's value as "the one string this provider needs," regardless of what kind of string it is.
const PROVIDER_KEY_VAR: Record<RixieProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  ollama: "OLLAMA_BASE_URL",
};

// Deliberately PER-PROVIDER, not a single shared RIXIE_MODEL — confirmed the hard way that a
// single override survives a provider switch and gets sent to whatever provider is now active,
// which breaks the moment it's a model name that only exists on the PREVIOUS provider's API (e.g.
// an Anthropic model name sent to Groq: a 404, not a working chat). Each provider remembers its
// own model choice independently, exactly like PROVIDER_KEY_VAR above.
const PROVIDER_MODEL_VAR: Record<RixieProvider, string> = {
  anthropic: "RIXIE_MODEL_ANTHROPIC",
  openai: "RIXIE_MODEL_OPENAI",
  gemini: "RIXIE_MODEL_GEMINI",
  groq: "RIXIE_MODEL_GROQ",
  ollama: "RIXIE_MODEL_OLLAMA",
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

export interface RixieKeyStatus {
  activeProvider: RixieProvider;
  /** Whether a key is saved for EACH provider, not just the active one — setApiKey merges rather
   *  than replaces (see below), so switching providers doesn't lose earlier ones, and the
   *  Settings UI needs to know which ones are already usable without asking the user to re-paste
   *  a key it already has on disk. */
  configured: Record<RixieProvider, boolean>;
  /** The raw model override PER PROVIDER, if any — empty string means "no override for this
   *  provider," i.e. Rixie uses @veasna/ai's own defaultModelForProvider(that provider) guess. */
  models: Record<RixieProvider, string>;
}

/** Never the key value itself — the Settings UI only ever learns "configured or not" per
 *  provider, not the actual secret. */
export function getApiKeyStatus(): RixieKeyStatus {
  const env = loadRixieEnv();
  const activeProvider = (env.RIXIE_PROVIDER as RixieProvider) || "anthropic";
  const configured = Object.fromEntries(
    (Object.keys(PROVIDER_KEY_VAR) as RixieProvider[]).map((p) => [p, Boolean(env[PROVIDER_KEY_VAR[p]]?.trim())])
  ) as Record<RixieProvider, boolean>;
  // Ollama has a real, working default (localhost:11434, model llama3.1) and needs no stored value
  // to be usable — unlike the other four, where an unset key hard-fails the very first request, so
  // "configured" always reads true for it regardless of whether OLLAMA_BASE_URL is actually set.
  configured.ollama = true;
  const models = Object.fromEntries(
    (Object.keys(PROVIDER_MODEL_VAR) as RixieProvider[]).map((p) => [p, env[PROVIDER_MODEL_VAR[p]] ?? ""])
  ) as Record<RixieProvider, string>;
  return { activeProvider, configured, models };
}

/** What route.ts should actually pass as `model` for the given provider, given the already-loaded
 *  override file — the per-provider override if one's set, or "" (meaning: fall back to
 *  @veasna/ai's own defaultModelForProvider) otherwise. Takes `env` rather than re-reading the
 *  file itself, since route.ts's getAgent() already has it loaded from the same loadRixieEnv()
 *  call it uses for provider/key resolution. */
export function modelOverrideFrom(env: Record<string, string>, provider: RixieProvider): string {
  return env[PROVIDER_MODEL_VAR[provider]] ?? "";
}

function writeRixieEnv(values: Record<string, string>): void {
  const envPath = rixieEnvPath();
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf-8");
}

/** Merges with (never replaces) whatever's already in the file — a hand-edited RIXIE_MODEL, or
 *  another provider's already-saved key, survives a Settings save untouched. Also makes this the
 *  active provider. */
export function setApiKey(provider: RixieProvider, apiKey: string): void {
  const existing = loadRixieEnv();
  existing.RIXIE_PROVIDER = provider;
  existing[PROVIDER_KEY_VAR[provider]] = apiKey.trim();
  writeRixieEnv(existing);
}

/** Switches the active provider WITHOUT touching any stored key — the common case where the user
 *  already saved a key for this provider earlier and just wants to switch back to it. */
export function setActiveProvider(provider: RixieProvider): void {
  const existing = loadRixieEnv();
  existing.RIXIE_PROVIDER = provider;
  writeRixieEnv(existing);
}

/** Sets (or, given an empty/whitespace-only string, CLEARS) this SPECIFIC provider's model
 *  override — never touches any other provider's, or the active provider itself. Clearing it
 *  falls back to @veasna/ai's own defaultModelForProvider(provider) guess. */
export function setModel(provider: RixieProvider, model: string): void {
  const existing = loadRixieEnv();
  const trimmed = model.trim();
  const varName = PROVIDER_MODEL_VAR[provider];
  if (trimmed) existing[varName] = trimmed;
  else delete existing[varName];
  writeRixieEnv(existing);
}
