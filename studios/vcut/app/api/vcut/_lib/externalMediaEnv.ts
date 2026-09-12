import { VCUT_HOSTED } from "./auth";
import { loadVstudioEnv } from "./inpaintEnvFile";

/** Stock media search (Pixabay) and AI image/video generation (Replicate) are both hosted-only
 *  features (no local/desktop self-serve key-entry UI, by deliberate scope decision — unlike Remove
 *  Object/Captions) — same minimal shape as `getKiriToken` in `inpaintEnvFile.ts`: one server-owned
 *  key read fresh on every request, no per-user configuration anywhere. Local dev still reads the
 *  same `.env.vcut` file the founder already hand-edits for every other local secret, purely so this
 *  is testable without deploying, not because local/desktop users will ever see a key-entry field for
 *  it. */

const HOSTED_PIXABAY_KEY_ENV_VAR = "VCUT_HOSTED_PIXABAY_API_KEY";
const PIXABAY_LOCAL_ENV_VAR = "PIXABAY_API_KEY";

export function getPixabayApiKey(): string | null {
  if (VCUT_HOSTED) return process.env[HOSTED_PIXABAY_KEY_ENV_VAR]?.trim() || null;
  return loadVstudioEnv()[PIXABAY_LOCAL_ENV_VAR]?.trim() || null;
}

// AI image/video generation both run on Replicate — the SAME provider, and the SAME server-owned
// token, Remove Object/Captions already use in hosted mode (one Railway variable, one bill, not a
// second Replicate account). `getReplicateToken` (`inpaintEnvFile.ts`) already reads exactly that
// token; re-exported here rather than reading `VCUT_HOSTED_REPLICATE_API_TOKEN` a second time so
// there is only ONE place that env var's name is ever spelled out.
export { getReplicateToken as getReplicateTokenForGeneration } from "./inpaintEnvFile";
