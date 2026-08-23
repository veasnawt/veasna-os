import fs from "fs";
import path from "path";

/** Same per-studio env file `_lib/inpaintEnvFile.ts` already uses (`Documents/Veasna OS/vstudio.env`
 *  in the packaged app via `VEASNA_WORKSPACE_ROOT`, a gitignored `.env.vstudio` in this checkout under
 *  `pnpm dev`) — a SEPARATE function reading the SAME file, not a shared import, matching that file's
 *  own note on why (`_lib/localOnly.ts`'s pattern: no cross-studio import path, and here not even a
 *  cross-ROUTE one is needed — both simply read/write the one env file by key). Read fresh on every
 *  call, so saving a key here takes effect on the very next request with no restart. */
function captionsEnvPath(): string {
  const workspaceRoot = process.env.VEASNA_WORKSPACE_ROOT;
  return workspaceRoot ? path.join(workspaceRoot, "vstudio.env") : path.join(process.cwd(), ".env.vstudio");
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

function loadEnv(): Record<string, string> {
  const envPath = captionsEnvPath();
  if (!fs.existsSync(envPath)) return {};
  return parseEnvFile(fs.readFileSync(envPath, "utf-8"));
}

function writeEnv(values: Record<string, string>): void {
  const envPath = captionsEnvPath();
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf-8");
}

const KEY_VAR = "CAPTIONS_OPENAI_KEY";

/** One provider (OpenAI Whisper) — unlike `inpaintEnvFile.ts`'s `InpaintKeyStatus`, there's no
 *  "active provider" to track, just whether a key is saved. */
export function getCaptionsKeyStatus(): { configured: boolean } {
  return { configured: Boolean(loadEnv()[KEY_VAR]?.trim()) };
}

export function setCaptionsApiKey(apiKey: string): void {
  const existing = loadEnv();
  existing[KEY_VAR] = apiKey.trim();
  writeEnv(existing);
}

/** The saved key itself, or null if none is set — server-side only, never returned to the client (the
 *  settings route only ever reports `configured: boolean`, same discipline `getActiveInpaintToken`
 *  follows for its own providers). */
export function getCaptionsApiKey(): string | null {
  return loadEnv()[KEY_VAR]?.trim() || null;
}
