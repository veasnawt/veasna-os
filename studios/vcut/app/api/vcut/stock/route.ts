import { downloadMediaUrl, importMediaBytes } from "../_lib/importMedia";
import { hostedSessionRoute, localRoute } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs } from "../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stock photo/video search — Wikimedia Commons (commons.wikimedia.org/w/api.php), not Pixabay: this
 *  needs no API key or account at all (confirmed live, not assumed from docs alone — Pixabay's own free
 *  tier still required a signup+key), covers BOTH images and video through the one endpoint, returns
 *  direct downloadable file URLs (not a redirect through an HTML page), and every result carries real
 *  per-file license metadata (Commons only hosts openly-licensed/public-domain media in the first
 *  place). `User-Agent` is set on every request per Wikimedia's own API etiquette — not hard-enforced
 *  with a block, but the polite, expected thing to send as an identifiable client. */
const COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "VCut/1.0 (https://vcut.io; stock media search)";

type StockKind = "image" | "video";

interface StockResult {
  id: string;
  kind: StockKind;
  /** The file's own title with the "File:" namespace prefix and extension both stripped (e.g.
   *  "File:Cat_November_2010-1a.jpg" → "Cat November 2010-1a") — shown under the tile and used to build
   *  a friendly import filename, the same two jobs Pixabay's own `tags` field did before. */
  title: string;
  /** A small preview URL suitable for a search-results GRID tile — for video this is a static poster
   *  frame Commons itself generates (via `iiurlwidth`), never the full video file. */
  previewUrl: string;
  /** The actual file this becomes if imported — Commons' own original, already-hosted file (no
   *  separate "large" vs "original" tier the way Pixabay offered; a project timeline re-encodes on
   *  export regardless, so there's no real benefit to a smaller convenience tier even if one existed). */
  downloadUrl: string;
  width: number;
  height: number;
  /** Present for video results only. */
  duration?: number;
  /** Commons' own uploader username — what the UI's attribution line credits, same role Pixabay's own
   *  `user` field played. */
  user: string;
  /** The file's own wiki description page — every result's attribution line links here, since that's
   *  where the REAL license terms and any additional attribution Commons itself requires are stated in
   *  full (this app's own short credit line is a courtesy, not a substitute for it). */
  pageURL: string;
  /** Short license name (e.g. "CC BY-SA 4.0", "Public domain") — shown next to the credit line so a
   *  user picking a result knows what they're agreeing to before importing it. */
  license: string;
}

interface CommonsImageInfo {
  url: string;
  descriptionurl: string;
  thumburl?: string;
  width: number;
  height: number;
  user: string;
  mime: string;
  duration?: number;
  extmetadata?: { LicenseShortName?: { value: string } };
}

interface CommonsPage {
  pageid: number;
  title: string;
  imageinfo?: CommonsImageInfo[];
}

interface CommonsResponse {
  query?: { pages?: Record<string, CommonsPage> };
  continue?: { gsroffset?: number };
}

function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/") || mime === "application/ogg";
}

/** "File:Cat_November_2010-1a.jpg" → "Cat November 2010-1a" — strips the namespace prefix every
 *  Commons file title carries and the extension (already known separately, from `downloadUrl`'s own
 *  path — keeping both would just duplicate it in every display name and every generated filename). */
function titleFromCommonsFile(rawTitle: string): string {
  const withoutNamespace = rawTitle.replace(/^File:/, "");
  const withoutExtension = withoutNamespace.replace(/\.[a-zA-Z0-9]+$/, "");
  return withoutExtension.replace(/_/g, " ").trim() || rawTitle;
}

const RESULTS_PER_PAGE = 24;

/** `GET /api/vcut/stock?type=image|video&q=...&page=1` — proxied through this server (never called
 *  directly from the client), same "server is the one place that talks to the provider" shape every
 *  other stock/AI route here uses, even though there's no secret key to protect this time — keeping the
 *  client thin and the provider swappable without a second place to update mattered more than saving
 *  one server hop. */
export const GET = hostedSessionRoute(async (req) => {
  const url = new URL(req.url);
  const kind: StockKind = url.searchParams.get("type") === "video" ? "video" : "image";
  const q = url.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  if (!q) return Response.json({ results: [], hasMore: false });

  // `filetype:video` is Commons' own search-syntax filter (confirmed live, not assumed) — narrowing the
  // SEARCH itself rather than fetching everything and filtering client-side keeps a video search from
  // burning its own page of results on images `RESULTS_PER_PAGE` never even reaches.
  const searchTerms = kind === "video" ? `${q.slice(0, 100)} filetype:video` : q.slice(0, 100);

  const commonsUrl = new URL(COMMONS_API_URL);
  commonsUrl.searchParams.set("action", "query");
  commonsUrl.searchParams.set("format", "json");
  commonsUrl.searchParams.set("generator", "search");
  commonsUrl.searchParams.set("gsrnamespace", "6"); // File namespace — only actual media, not articles.
  commonsUrl.searchParams.set("gsrsearch", searchTerms);
  commonsUrl.searchParams.set("gsrlimit", String(RESULTS_PER_PAGE));
  commonsUrl.searchParams.set("gsroffset", String((page - 1) * RESULTS_PER_PAGE));
  commonsUrl.searchParams.set("prop", "imageinfo");
  commonsUrl.searchParams.set("iiprop", "url|size|user|mime|extmetadata");
  // A resized preview for the grid tile — for video files Commons generates a static poster-frame
  // JPEG at this width rather than a resized video, the same "thumbnail" concept either kind needs.
  commonsUrl.searchParams.set("iiurlwidth", "400");

  const res = await fetch(commonsUrl, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 429) throw new ApiError(429, "Stock search is busy right now — try again in a moment", "stock-rate-limited");
  if (!res.ok) throw new ApiError(502, "Stock search is temporarily unavailable", "stock-search-failed");
  const data = (await res.json()) as CommonsResponse;

  const pages = Object.values(data.query?.pages ?? {});
  const results: StockResult[] = pages
    .map((page): StockResult | null => {
      const info = page.imageinfo?.[0];
      if (!info) return null;
      const resultIsVideo = isVideoMime(info.mime);
      // Belt-and-suspenders against `filetype:video`/plain search not perfectly matching what this
      // route actually asked for (an audio file can also slip into a video search's own results on
      // Commons, since neither is an "image") — dropped rather than shown as the wrong kind.
      if (resultIsVideo !== (kind === "video")) return null;
      return {
        id: String(page.pageid),
        kind,
        title: titleFromCommonsFile(page.title),
        previewUrl: info.thumburl ?? info.url,
        downloadUrl: info.url,
        width: info.width,
        height: info.height,
        ...(resultIsVideo && info.duration ? { duration: info.duration } : null),
        user: info.user,
        pageURL: info.descriptionurl,
        license: info.extmetadata?.LicenseShortName?.value ?? "",
      };
    })
    .filter((r): r is StockResult => r !== null);

  return Response.json({ results, hasMore: Boolean(data.continue) });
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
  // Only ever a Wikimedia-hosted URL, never an arbitrary caller-supplied host — this route exists to
  // land a result THIS server's own search just returned, not as a general-purpose URL fetcher an
  // authenticated user could point at an internal address (SSRF). Both the real file host
  // (upload.wikimedia.org) and the wiki itself (commons.wikimedia.org) are allowed since either could
  // plausibly appear here.
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new ApiError(400, "Invalid url", "invalid-url");
  }
  if (!/(^|\.)wikimedia\.org$/.test(parsed.hostname)) {
    throw new ApiError(400, "That url isn't a recognized stock media source", "invalid-source");
  }

  const bytes = await downloadMediaUrl(sourceUrl);
  const asset = await importMediaBytes(paths, bytes, body?.name?.trim() || parsed.pathname.split("/").pop() || "stock-media");

  return Response.json({ asset });
});
