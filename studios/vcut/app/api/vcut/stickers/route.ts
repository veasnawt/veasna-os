import { GIPHY_ITEM_CREDITS, type StickerProvider, type StickerType } from "@veasnawt/vcut/src/project/stickers";
import { refundCredits } from "../_lib/credits";
import { getGiphyApiKey, getKlipyApiKey } from "../_lib/externalMediaEnv";
import { requireSessionUser, VCUT_HOSTED } from "../_lib/auth";
import { downloadMediaUrl, importAnimatedImageBytes } from "../_lib/importMedia";
import { corsPreflight, hostedCreditGatedRoute, hostedSessionRouteCors } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs, ensureUserMediaDirs } from "../_lib/paths";
import { getProfile } from "../_lib/profiles";
import { isAllowedStickerDownload, klipyCustomerId, searchStickerProvider } from "../_lib/stickerProviders";
import { checkStorageQuota, insertUserMedia } from "../_lib/userMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The Stickers tool — animated sticker and GIF search from two providers, then import as an animated
 *  image asset (see `packages/vcut/src/project/stickers.ts`).
 *
 *  - KLIPY: free.
 *  - GIPHY: its production API is a paid license, so each GIPHY sticker/GIF ADDED costs
 *    `GIPHY_ITEM_CREDITS` (hosted only). Searching is free for both.
 *
 *  Proxied through this server like stock search: the keys stay server-side and the client doesn't
 *  depend on either provider's API shape. */

const MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024;

function keyFor(provider: StickerProvider): string | null {
  return provider === "klipy" ? getKlipyApiKey() : getGiphyApiKey();
}

function parseProvider(value: unknown): StickerProvider {
  if (value === "klipy" || value === "giphy") return value;
  throw new ApiError(400, "Unknown sticker provider", "invalid-sticker-provider");
}

function parseType(value: unknown): StickerType {
  return value === "gifs" ? "gifs" : "stickers";
}

/** `GET /api/vcut/stickers?availability=1` → which providers are configured, and what GIPHY costs.
 *  `GET /api/vcut/stickers?provider=klipy|giphy&type=stickers|gifs&q=...&page=1` → results (trending
 *  when `q` is empty). CORS-enabled (`hostedSessionRouteCors`): desktop and mobile call this directly
 *  on the live vcut.io deployment now — see that wrapper's own doc comment. */
export const GET = hostedSessionRouteCors(async (req, user) => {
  const url = new URL(req.url);
  if (url.searchParams.get("availability")) {
    return Response.json({ klipy: Boolean(getKlipyApiKey()), giphy: Boolean(getGiphyApiKey()), giphyCredits: VCUT_HOSTED ? GIPHY_ITEM_CREDITS : 0 });
  }

  const provider = parseProvider(url.searchParams.get("provider"));
  const key = keyFor(provider);
  if (!key) throw new ApiError(503, "Stickers aren't set up on this server yet", "stickers-not-configured");
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
  const data = await searchStickerProvider({
    provider,
    key,
    type: parseType(url.searchParams.get("type")),
    query: url.searchParams.get("q")?.trim() ?? "",
    page,
    customerId: klipyCustomerId(user?.id ?? null),
  });
  return Response.json(data);
});

/** `POST /api/vcut/stickers?projectId=...` `{provider, type, id, url, name}` — downloads the picked
 *  item's GIF and imports it (see `importAnimatedImageBytes`). A GIPHY pick spends credits only once the
 *  download succeeded and fits the storage quota, and gets them back if the conversion then fails. */
export const POST = hostedCreditGatedRoute("giphy-sticker", GIPHY_ITEM_CREDITS, async (req, user, spend) => {
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) throw new ApiError(400, "Missing projectId", "missing-project-id");

  const body = (await req.json().catch(() => null)) as { provider?: unknown; type?: unknown; id?: unknown; url?: unknown; name?: unknown } | null;
  const provider = parseProvider(body?.provider);
  const type = parseType(body?.type);
  const itemId = typeof body?.id === "string" ? body.id.slice(0, 100) : "";
  const sourceUrl = typeof body?.url === "string" ? body.url.trim() : "";
  if (!itemId || !sourceUrl) throw new ApiError(400, "Missing sticker", "missing-sticker");
  if (!keyFor(provider)) throw new ApiError(503, "Stickers aren't set up on this server yet", "stickers-not-configured");
  if (!isAllowedStickerDownload(provider, sourceUrl)) {
    throw new ApiError(400, "That isn't a recognized sticker source", "invalid-sticker-source");
  }

  const bytes = await downloadMediaUrl(sourceUrl, MAX_DOWNLOAD_BYTES);
  const title = typeof body?.name === "string" ? body.name.trim() : "";
  const friendly = title.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || (type === "gifs" ? "gif" : "sticker");
  const suggestedName = `${friendly}.gif`;
  const stickerSource = { provider, type, id: itemId };

  if (VCUT_HOSTED) {
    const sessionUser = user ?? (await requireSessionUser(req));
    const profile = await getProfile(sessionUser.id);
    await checkStorageQuota(sessionUser.id, profile?.plan ?? "free", bytes.byteLength);
    const charged = provider === "giphy";
    if (charged) await spend();
    try {
      const libraryPaths = ensureUserMediaDirs(sessionUser.id);
      const asset = await importAnimatedImageBytes(libraryPaths, bytes, suggestedName, stickerSource);
      await insertUserMedia(sessionUser.id, {
        id: asset.id,
        kind: "image",
        name: asset.name,
        relPath: asset.relPath,
        thumbnailRelPath: asset.thumbnailRelPath ?? null,
        filmstripRelPath: null,
        waveformRelPath: null,
        duration: asset.duration,
        width: asset.width ?? null,
        height: asset.height ?? null,
        fps: null,
        hasAudio: false,
        sizeBytes: asset.sizeBytes,
        aiGeneration: null,
        // Reached again through the Stickers tool, not "All my media" — see `importAnimatedImageBytes`.
        hidden: true,
      });
      asset.libraryMediaId = asset.id;
      return Response.json({ asset });
    } catch (err) {
      if (charged) void refundCredits(sessionUser.id, GIPHY_ITEM_CREDITS);
      throw err;
    }
  }

  const asset = await importAnimatedImageBytes(ensureProjectDirs(projectId), bytes, suggestedName, stickerSource);
  return Response.json({ asset });
});

/** The browser's own CORS preflight for `GET`'s now-cross-origin `Authorization` header — see
 *  `hostedSessionRouteCors`'s own doc comment. `POST` doesn't need this: it's still only ever called
 *  same-origin (desktop's own local server), unchanged. Mobile's own GIPHY charge goes through the
 *  separate `stickers/charge` route instead — see that route's own doc comment for why. */
export const OPTIONS = corsPreflight;
