import { GIPHY_ITEM_CREDITS, type StickerProvider } from "@veasnawt/vcut/src/project/stickers";
import { corsPreflight, hostedCreditGatedRouteCors } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseProvider(value: unknown): StickerProvider {
  if (value === "klipy" || value === "giphy") return value;
  throw new ApiError(400, "Unknown sticker provider", "invalid-sticker-provider");
}

/** `POST /api/vcut/stickers/charge` `{provider}` — charges real credits for a GIPHY sticker/GIF the
 *  CALLER already downloaded and imported itself. Exists only for mobile: it has no local server to
 *  relay `stickers/route.ts`'s own POST through (see `client.ts`'s `importStickerResult`), so it
 *  downloads the (always public) GIPHY CDN file directly and imports it locally, then calls this route
 *  purely to charge the real cost server-side — the one part of that flow that genuinely can't happen
 *  client-side. KLIPY is free, so a `klipy` call is accepted as a harmless no-op rather than an error;
 *  the client doesn't need its own separate "is this even billable" branch before calling this.
 *  CORS-enabled (`hostedCreditGatedRouteCors`) — see that wrapper's own doc comment for why this is one
 *  of the few routes that both charges money AND must be reachable cross-origin. */
export const POST = hostedCreditGatedRouteCors("giphy-sticker", GIPHY_ITEM_CREDITS, async (req, _user, spend) => {
  const body = (await req.json().catch(() => null)) as { provider?: unknown } | null;
  const provider = parseProvider(body?.provider);
  if (provider === "giphy") await spend();
  return Response.json({ ok: true });
});

export const OPTIONS = corsPreflight;
