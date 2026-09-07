import fs from "fs";
import path from "path";
import { VCUT_HOSTED } from "./auth";
import { getLocalSetupStatus } from "./localModel";

/** Hosted mode's ONE server-owned Replicate token, set once as a Railway variable — no per-user file,
 *  no provider choice (fal/local are simply never reachable hosted: `fal` would need its own separate
 *  server-owned key for no real benefit given Replicate already covers this; `local` means spawning
 *  Python ML inference on the shared production box per tenant, confirmed unsafe by reading
 *  `runLocalPrediction` in `inpaint/route.ts`). `inpaint/settings/route.ts` and `local-setup/route.ts`
 *  stay `hostedDisabledRoute`-gated — there is nothing for a hosted user to configure. */
const HOSTED_REPLICATE_TOKEN_ENV_VAR = "VCUT_HOSTED_REPLICATE_API_TOKEN";

/** Documents/Veasna OS/vcut.env in the packaged desktop app (`VEASNA_WORKSPACE_ROOT` set there);
 *  a gitignored file inside this checkout when running via `pnpm dev` instead (no
 *  `VEASNA_WORKSPACE_ROOT` there) — same "read fresh on every request, no restart needed" behavior
 *  either way, mirroring `studios/universe/app/api/_lib/rixieEnvFile.ts`'s own established convention
 *  for exactly this kind of user-supplied cloud API key. A SEPARATE file from `rixie.env` (not an
 *  extension of it) — that file lives in a different Next.js app/bundle (`studios/universe`), with no
 *  cross-studio import path (same reason `_lib/localOnly.ts` is a copy here, not a shared import, per
 *  its own header comment). `studios/vcut/.gitignore` already has a blanket `.env*` pattern (with
 *  `!.env.example`), so `.env.vcut` needs no separate gitignore entry. */
function inpaintEnvPath(): string {
  const workspaceRoot = process.env.VEASNA_WORKSPACE_ROOT;
  return workspaceRoot ? path.join(workspaceRoot, "vcut.env") : path.join(process.cwd(), ".env.vcut");
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

/** Read fresh on every call, by design — this is what makes saving a new key in the Inspector's
 *  "Remove Object" section take effect on the very next request, with no server restart. */
export function loadVstudioEnv(): Record<string, string> {
  const envPath = inpaintEnvPath();
  if (!fs.existsSync(envPath)) return {};
  return parseEnvFile(fs.readFileSync(envPath, "utf-8"));
}

function writeVstudioEnv(values: Record<string, string>): void {
  const envPath = inpaintEnvPath();
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf-8");
}

export type InpaintProvider = "replicate" | "fal" | "local";
/** The two providers that use an API key at all — "local" runs entirely on this machine, so it has no
 *  key/token concept; its "configured" status instead reflects whether the Python runtime is set up
 *  (see `getInpaintKeyStatus` below). */
type CloudInpaintProvider = "replicate" | "fal";

const PROVIDER_KEY_VAR: Record<CloudInpaintProvider, string> = {
  replicate: "REPLICATE_API_TOKEN",
  fal: "FAL_KEY",
};

function isCloudProvider(provider: InpaintProvider): provider is CloudInpaintProvider {
  return provider === "replicate" || provider === "fal";
}

export interface InpaintKeyStatus {
  activeProvider: InpaintProvider;
  configured: Record<InpaintProvider, boolean>;
}

/** Never a token itself — callers (the settings route, the Inspector UI) only ever learn "which
 *  provider is active" and "configured or not" per provider, never the actual secrets. `local`'s
 *  "configured" comes from `getLocalSetupStatus()` (is the Python runtime provisioned?) rather than
 *  this env file — folded in here so every existing call site (settings route, job route's HEAD/POST)
 *  keeps treating `configured` as one opaque per-provider map, with no separate local-specific check
 *  needed anywhere else. */
export function getInpaintKeyStatus(): InpaintKeyStatus {
  if (VCUT_HOSTED) {
    return {
      activeProvider: "replicate",
      configured: { replicate: Boolean(process.env[HOSTED_REPLICATE_TOKEN_ENV_VAR]?.trim()), fal: false, local: false },
    };
  }
  const env = loadVstudioEnv();
  const activeProvider: InpaintProvider =
    env.INPAINT_PROVIDER === "fal" ? "fal" : env.INPAINT_PROVIDER === "local" ? "local" : "replicate";
  const configured = Object.fromEntries(
    (Object.keys(PROVIDER_KEY_VAR) as CloudInpaintProvider[]).map((p) => [p, Boolean(env[PROVIDER_KEY_VAR[p]]?.trim())])
  ) as Record<InpaintProvider, boolean>;
  configured.local = getLocalSetupStatus().ready;
  return { activeProvider, configured };
}

/** Saving a key also activates its provider — same rule Rixie's own `setApiKey` follows. Never called
 *  with `"local"` (it has no key) — the Inspector only offers this for the two cloud providers. */
export function setInpaintApiKey(provider: CloudInpaintProvider, apiKey: string): void {
  const existing = loadVstudioEnv();
  existing.INPAINT_PROVIDER = provider;
  existing[PROVIDER_KEY_VAR[provider]] = apiKey.trim();
  writeVstudioEnv(existing);
}

export function setActiveInpaintProvider(provider: InpaintProvider): void {
  const existing = loadVstudioEnv();
  existing.INPAINT_PROVIDER = provider;
  writeVstudioEnv(existing);
}

/** The active provider's own saved token, or null if it doesn't have one yet (always null for
 *  `"local"`, which has no token concept — callers must check `activeProvider` before treating a null
 *  token as "not configured"). */
export function getActiveInpaintToken(): string | null {
  if (VCUT_HOSTED) return process.env[HOSTED_REPLICATE_TOKEN_ENV_VAR]?.trim() || null;
  const { activeProvider } = getInpaintKeyStatus();
  if (!isCloudProvider(activeProvider)) return null;
  return loadVstudioEnv()[PROVIDER_KEY_VAR[activeProvider]]?.trim() || null;
}

/** `captions/route.ts`'s own token need — Auto Captions runs on Replicate's `openai/whisper` model,
 *  funded by the SAME saved Replicate credential Remove Object uses (one account, two features,
 *  configured once in either Inspector section — see `inpaint/settings/route.ts`, which both now
 *  share). Deliberately reads the token directly by its own key rather than going through
 *  `getActiveInpaintToken`'s "whichever provider Remove Object currently has active" indirection:
 *  Captions has no provider CHOICE of its own (it only ever runs on Replicate), so a local user who
 *  saved a Replicate token here and later switched Remove Object's active provider to fal/local
 *  should still have Captions keep working — reading `getActiveInpaintToken()` instead would make
 *  Captions look unconfigured despite the token still sitting right here in the same file. */
export function getReplicateToken(): string | null {
  if (VCUT_HOSTED) return process.env[HOSTED_REPLICATE_TOKEN_ENV_VAR]?.trim() || null;
  return loadVstudioEnv()[PROVIDER_KEY_VAR.replicate]?.trim() || null;
}
