import { getCaptionsKeyStatus, setCaptionsApiKey } from "../../_lib/captionsEnvFile";
import { localRoute } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether an OpenAI key is saved — both Auto Captions entry points (Inspector's per-clip section, the
 *  toolbar's whole-sequence dialog) call this to decide between the key-entry prompt and the working
 *  "Generate Captions" button. Never returns the key itself. */
export const GET = localRoute(async () => {
  return Response.json(getCaptionsKeyStatus());
});

/** Saves the OpenAI API key, file-backed (see `captionsEnvFile.ts`) so it survives a server restart
 *  without needing a real `.env` edit or a rebuild. One provider only — unlike Remove Object's
 *  settings route, there's no provider to select, just a key to save. */
export const POST = localRoute(async (req) => {
  const body = (await req.json().catch(() => ({}))) as { apiKey?: string };
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) throw new ApiError(400, "API key is required", "missing-api-key");
  setCaptionsApiKey(apiKey);
  return Response.json({ ok: true });
});
