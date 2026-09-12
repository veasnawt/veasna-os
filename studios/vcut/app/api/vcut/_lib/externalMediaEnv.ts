/** AI image/video generation is a hosted-only feature (no local/desktop self-serve key-entry UI, by
 *  deliberate scope decision — unlike Remove Object/Captions) — same minimal shape as `getKiriToken` in
 *  `inpaintEnvFile.ts`: one server-owned key read fresh on every request, no per-user configuration
 *  anywhere. Stock media search (`stock/route.ts`) used to live here too (Pixabay, which needed its own
 *  key) — now on Wikimedia Commons, which needs no key/account at all, so there's nothing left for this
 *  file to hold for it. */

// AI image/video generation both run on Replicate — the SAME provider, and the SAME server-owned
// token, Remove Object/Captions already use in hosted mode (one Railway variable, one bill, not a
// second Replicate account). `getReplicateToken` (`inpaintEnvFile.ts`) already reads exactly that
// token; re-exported here rather than reading `VCUT_HOSTED_REPLICATE_API_TOKEN` a second time so
// there is only ONE place that env var's name is ever spelled out.
export { getReplicateToken as getReplicateTokenForGeneration } from "./inpaintEnvFile";
