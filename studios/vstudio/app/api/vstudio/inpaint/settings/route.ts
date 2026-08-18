import { getInpaintKeyStatus, setInpaintApiKey, setActiveInpaintProvider, type InpaintProvider } from "../../_lib/inpaintEnvFile";
import { localRoute } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALL_PROVIDERS: InpaintProvider[] = ["replicate", "fal", "local"];
// Only these two have a key/token to save — "local" runs entirely on this machine, provisioned via a
// setup job (see `/inpaint/local-setup`), not a saved credential.
const CLOUD_PROVIDERS: InpaintProvider[] = ["replicate", "fal"];

function isProvider(value: unknown): value is InpaintProvider {
  return typeof value === "string" && (ALL_PROVIDERS as string[]).includes(value);
}

function isCloudProvider(value: unknown): value is "replicate" | "fal" {
  return typeof value === "string" && (CLOUD_PROVIDERS as string[]).includes(value);
}

/** Which provider is active and which providers have a saved key — the Inspector's "Remove Object"
 *  section calls this to render its provider dropdown and decide between showing the key-entry prompt
 *  and the working "Draw region" button. Never returns the keys themselves. */
export const GET = localRoute(async () => {
  return Response.json(getInpaintKeyStatus());
});

/** Saves a provider's API key, file-backed (see `inpaintEnvFile.ts`) so it survives a server restart
 *  without needing a real `.env` edit or a rebuild. Saving a key also activates its provider. */
export const POST = localRoute(async (req) => {
  const body = (await req.json().catch(() => ({}))) as { provider?: string; apiKey?: string };
  if (!isCloudProvider(body.provider)) throw new ApiError(400, "That provider has no key to save", "unknown-provider");
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) throw new ApiError(400, "API key is required", "missing-api-key");
  setInpaintApiKey(body.provider, apiKey);
  return Response.json({ ok: true });
});

/** Switches the active provider without touching any saved key — the "this provider is already
 *  configured, just switch to it" path (mirrors Rixie's own `setActiveProvider`). */
export const PATCH = localRoute(async (req) => {
  const body = (await req.json().catch(() => ({}))) as { provider?: string };
  if (!isProvider(body.provider)) throw new ApiError(400, "Unknown provider", "unknown-provider");
  setActiveInpaintProvider(body.provider);
  return Response.json({ ok: true });
});
