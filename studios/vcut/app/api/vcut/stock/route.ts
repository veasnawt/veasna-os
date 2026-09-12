import { getPixabayApiKey } from "../_lib/externalMediaEnv";
import { downloadMediaUrl, importMediaBytes } from "../_lib/importMedia";
import { hostedSessionRoute, localRoute } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs } from "../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stock photo/video search (Pixabay: https://pixabay.com/api/docs/) — genuinely free to VCut itself
 *  (Pixabay doesn't charge per request, just rate-limits: 100 requests/60s on the one server-owned
 *  key every hosted user shares), so unlike Remove Object/Captions/AI generation this is `GET`/`POST`
 *  via the plain session/ownership wrappers, never `hostedCreditGatedRoute` — there is no real cost
 *  here to recover via credits. */
const PIXABAY_IMAGES_URL = "https://pixabay.com/api/";
const PIXABAY_VIDEOS_URL = "https://pixabay.com/api/videos/";

type StockKind = "image" | "video";

interface StockResult {
  id: string;
  kind: StockKind;
  /** A small/medium URL suitable for a search-results GRID tile — never the full-quality file (no
   *  reason to spend bandwidth on that before the user has even picked one). */
  previewUrl: string;
  /** The actual file this becomes if imported — the largest quality Pixabay offers for images,
   *  "large" (1920 px wide, not the absolute original) for videos: a project timeline re-encodes on
   *  export regardless, so the largest CONVENIENCE tier is the right trade-off against import time,
   *  not the (much bigger) uncompressed original. */
  downloadUrl: string;
  width: number;
  height: number;
  /** Present for video results only. */
  duration?: number;
  tags: string;
  /** Pixabay's own API terms require crediting the source whenever results are shown, not just on
   *  import — `user`/`pageURL` are what the UI's own attribution line under each tile links to. */
  user: string;
  pageURL: string;
}

interface PixabayImageHit {
  id: number;
  pageURL: string;
  tags: string;
  previewURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
}

interface PixabayVideoHit {
  id: number;
  pageURL: string;
  tags: string;
  duration: number;
  videos: {
    large: { url: string; width: number; height: number };
    medium: { url: string; width: number; height: number };
    small: { url: string; width: number; height: number };
    tiny: { url: string; width: number; height: number };
  };
  user: string;
}

/** `GET /api/vcut/stock?type=image|video&q=...&page=1` — proxied through this server (never called
 *  directly from the client) so the shared Pixabay key never reaches the browser, same reasoning
 *  every other provider token in this app is kept server-side. */
export const GET = hostedSessionRoute(async (req) => {
  const url = new URL(req.url);
  const kind = url.searchParams.get("type") === "video" ? "video" : "image";
  const q = url.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  if (!q) return Response.json({ results: [], hasMore: false });

  const apiKey = getPixabayApiKey();
  if (!apiKey) throw new ApiError(500, "Stock search isn't configured on this server", "stock-not-configured");

  const pixabayUrl = new URL(kind === "video" ? PIXABAY_VIDEOS_URL : PIXABAY_IMAGES_URL);
  pixabayUrl.searchParams.set("key", apiKey);
  pixabayUrl.searchParams.set("q", q.slice(0, 100));
  pixabayUrl.searchParams.set("page", String(page));
  pixabayUrl.searchParams.set("per_page", "30");
  pixabayUrl.searchParams.set("safesearch", "true");

  const res = await fetch(pixabayUrl);
  if (res.status === 429) throw new ApiError(429, "Stock search is busy right now — try again in a moment", "stock-rate-limited");
  if (!res.ok) throw new ApiError(502, "Stock search is temporarily unavailable", "stock-search-failed");
  const data = (await res.json()) as { total: number; totalHits: number; hits: (PixabayImageHit | PixabayVideoHit)[] };

  const results: StockResult[] =
    kind === "video"
      ? (data.hits as PixabayVideoHit[]).map((h) => ({
          id: String(h.id),
          kind: "video" as const,
          previewUrl: h.videos.tiny.url,
          downloadUrl: h.videos.large.url,
          width: h.videos.large.width,
          height: h.videos.large.height,
          duration: h.duration,
          tags: h.tags,
          user: h.user,
          pageURL: h.pageURL,
        }))
      : (data.hits as PixabayImageHit[]).map((h) => ({
          id: String(h.id),
          kind: "image" as const,
          previewUrl: h.previewURL,
          downloadUrl: h.largeImageURL,
          width: h.imageWidth,
          height: h.imageHeight,
          tags: h.tags,
          user: h.user,
          pageURL: h.pageURL,
        }));

  // Pixabay's own `totalHits` is capped at 500 regardless of `total`'s real value — comparing against
  // it (not `total`) is what keeps "Load more" from ever requesting a page Pixabay will just 400 on.
  const hasMore = page * 30 < data.totalHits;
  return Response.json({ results, hasMore });
});

/** `POST /api/vcut/stock?projectId=...` `{url, name}` — downloads a chosen result and lands it as a
 *  real project `Asset`, reusing the exact same pipeline an uploaded file goes through
 *  (`importMediaBytes`). `localRoute` (not `hostedSessionRoute`) because this one DOES have a
 *  `projectId` to check ownership against — same wrapper `media/route.ts`'s own upload endpoint uses. */
export const POST = localRoute(async (req) => {
  const bpProjectId = new URL(req.url).searchParams.get("projectId");
  if (!bpProjectId) throw new ApiError(400, "Missing projectId", "missing-project-id");
  const paths = ensureProjectDirs(bpProjectId);

  const body = (await req.json().catch(() => null)) as { url?: string; name?: string } | null;
  const sourceUrl = body?.url?.trim();
  if (!sourceUrl) throw new ApiError(400, "Missing url", "missing-url");
  // Only ever a Pixabay CDN URL, never an arbitrary caller-supplied host — this route exists to land
  // a result THIS server's own search just returned, not as a general-purpose URL fetcher an
  // authenticated user could point at an internal address (SSRF).
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new ApiError(400, "Invalid url", "invalid-url");
  }
  if (!/(^|\.)pixabay\.com$/.test(parsed.hostname)) throw new ApiError(400, "That url isn't a recognized stock media source", "invalid-source");

  const bytes = await downloadMediaUrl(sourceUrl);
  const asset = await importMediaBytes(paths, bytes, body?.name?.trim() || parsed.pathname.split("/").pop() || "stock-media");

  return Response.json({ asset });
});
