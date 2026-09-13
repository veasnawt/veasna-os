import { getPexelsApiKey } from "../_lib/externalMediaEnv";
import { requireSessionUser, VCUT_HOSTED } from "../_lib/auth";
import { downloadMediaUrl, importMediaBytes } from "../_lib/importMedia";
import { hostedSessionRoute, localRoute } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs, ensureUserMediaDirs } from "../_lib/paths";
import { getProfile } from "../_lib/profiles";
import { checkStorageQuota, insertUserMedia } from "../_lib/userMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stock photo/video search — Pexels (api.pexels.com), not Wikimedia Commons: Commons covers both
 *  kinds through one keyless endpoint, but its encyclopedia-oriented media (museum scans, random
 *  uploaded photos) turned out to be a poor fit for the polished "b-roll" look people actually expect
 *  from a video editor's own stock picker (raised directly, not assumed). Pexels' curated library is
 *  the better fit, at the real cost of needing a server-owned API key (`getPexelsApiKey`) and a genuine
 *  rate limit (200 req/hour, 20k/month on the free tier) neither Commons nor this app's OWN earlier
 *  Pixabay integration had to plan around the same way. Photos and videos are two SEPARATE Pexels
 *  endpoints (unlike Commons' one `generator=search` covering both) — this route calls whichever one
 *  `kind` asks for. */
const PEXELS_PHOTO_SEARCH_URL = "https://api.pexels.com/v1/search";
const PEXELS_VIDEO_SEARCH_URL = "https://api.pexels.com/videos/search";

type StockKind = "image" | "video";

interface StockResult {
  id: string;
  kind: StockKind;
  title: string;
  /** A tile-sized preview — Pexels' own `src.medium` for a photo, or its `image` screenshot for a
   *  video (never a playable file either way; the real video only exists at `downloadUrl`, fetched once
   *  a result is actually picked — same "static preview, real file on demand" split Commons used). */
  previewUrl: string;
  /** The file this becomes if imported — a photo's own `src.original`, or the best `video_files` entry
   *  found (see `bestVideoFile` below). */
  downloadUrl: string;
  width: number;
  height: number;
  /** Present for video results only. */
  duration?: number;
  /** The photographer/videographer's display name — what the UI's attribution line credits. */
  user: string;
  /** The result's own Pexels page — linked from the attribution line, same role Commons'
   *  `descriptionurl` played, even though Pexels' own license (unlike Commons' per-file CC terms)
   *  doesn't actually require attribution at all; crediting the source is still the honest thing to do. */
  pageURL: string;
  /** A single fixed value ("Pexels License") for every result — unlike Commons, where license terms
   *  genuinely varied per file, Pexels licenses everything in its library identically, so there's
   *  nothing per-result to look up here. */
  license: string;
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  alt?: string;
  src: { original: string; medium: string };
}

interface PexelsPhotoSearchResponse {
  photos: PexelsPhoto[];
  next_page?: string;
}

interface PexelsVideoFile {
  quality: "hd" | "sd" | "hls" | string;
  file_type: string;
  width: number;
  height: number;
  link: string;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  user: { name: string };
  video_files: PexelsVideoFile[];
}

interface PexelsVideoSearchResponse {
  videos: PexelsVideo[];
  next_page?: string;
}

/** Picks which of a video's several `video_files` entries to actually download — Pexels offers the
 *  same clip at multiple resolutions (`hd`/`sd`, each in turn at several widths), unlike Commons'
 *  Wikipedia-hosted files, which had exactly one. Prefers `hd` (rather than the outright largest file
 *  available, which can run to 4K) specifically BECAUSE library storage is now capped per plan
 *  (`STORAGE_CAP_BYTES` in `_lib/userMedia.ts`) — a single 4K stock clip could otherwise burn a real
 *  fraction of a Free plan's whole 1GB on one download. Only ever `video/mp4` (never `hls`, a
 *  streaming-manifest format FFmpeg's own import/probe pipeline can't treat as a plain downloadable
 *  file the way `downloadMediaUrl` needs). */
function bestVideoFile(files: PexelsVideoFile[]): PexelsVideoFile | null {
  const mp4Files = files.filter((f) => f.file_type === "video/mp4");
  if (mp4Files.length === 0) return null;
  const hdFiles = mp4Files.filter((f) => f.quality === "hd");
  const pool = hdFiles.length > 0 ? hdFiles : mp4Files;
  return pool.reduce((best, f) => (f.width > best.width ? f : best), pool[0]);
}

const RESULTS_PER_PAGE = 24;

/** `GET /api/vcut/stock?type=image|video&q=...&page=1` — proxied through this server (never called
 *  directly from the client), same "server is the one place that talks to the provider, keeping the
 *  client thin and the provider swappable" shape every other stock/AI route here uses — this time
 *  ALSO the place that actually protects the real secret key, unlike Commons' keyless predecessor. */
export const GET = hostedSessionRoute(async (req) => {
  const apiKey = getPexelsApiKey();
  if (!apiKey) throw new ApiError(500, "Stock search isn't configured on this server", "stock-not-configured");

  const url = new URL(req.url);
  const kind: StockKind = url.searchParams.get("type") === "video" ? "video" : "image";
  const q = url.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  if (!q) return Response.json({ results: [], hasMore: false });

  const pexelsUrl = new URL(kind === "video" ? PEXELS_VIDEO_SEARCH_URL : PEXELS_PHOTO_SEARCH_URL);
  pexelsUrl.searchParams.set("query", q.slice(0, 100));
  pexelsUrl.searchParams.set("page", String(page));
  pexelsUrl.searchParams.set("per_page", String(RESULTS_PER_PAGE));

  // Raw key, no "Bearer " prefix — confirmed against Pexels' own API docs, not assumed from the more
  // common bearer-token convention every OTHER provider here (Replicate included) actually uses.
  const res = await fetch(pexelsUrl, { headers: { Authorization: apiKey } });
  if (res.status === 429) throw new ApiError(429, "Stock search is busy right now — try again in a moment", "stock-rate-limited");
  if (!res.ok) throw new ApiError(502, "Stock search is temporarily unavailable", "stock-search-failed");

  let results: StockResult[];
  let hasMore: boolean;
  if (kind === "video") {
    const data = (await res.json()) as PexelsVideoSearchResponse;
    results = data.videos
      .map((v): StockResult | null => {
        const file = bestVideoFile(v.video_files);
        if (!file) return null;
        return {
          id: String(v.id),
          kind: "video",
          title: `Video by ${v.user.name}`,
          previewUrl: v.image,
          downloadUrl: file.link,
          width: v.width,
          height: v.height,
          duration: v.duration,
          user: v.user.name,
          pageURL: v.url,
          license: "Pexels License",
        };
      })
      .filter((r): r is StockResult => r !== null);
    hasMore = Boolean(data.next_page);
  } else {
    const data = (await res.json()) as PexelsPhotoSearchResponse;
    results = data.photos.map((p): StockResult => ({
      id: String(p.id),
      kind: "image",
      title: p.alt?.trim() || `Photo by ${p.photographer}`,
      previewUrl: p.src.medium,
      downloadUrl: p.src.original,
      width: p.width,
      height: p.height,
      user: p.photographer,
      pageURL: p.url,
      license: "Pexels License",
    }));
    hasMore = Boolean(data.next_page);
  }

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
  // Only ever a URL THIS server's own search just returned, never an arbitrary caller-supplied host —
  // this route exists to download a known-good search result, not as a general-purpose URL fetcher an
  // authenticated user could point at an internal address (SSRF). `images.pexels.com` serves photo
  // files directly; a video's `video_files[].link` instead points at Pexels' own Vimeo-hosted delivery
  // infrastructure (`player.vimeo.com`) — confirmed against Pexels' own API docs, not assumed from a
  // guess that video would be served the same way photos are.
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new ApiError(400, "Invalid url", "invalid-url");
  }
  if (!/(^|\.)pexels\.com$/.test(parsed.hostname) && parsed.hostname !== "player.vimeo.com") {
    throw new ApiError(400, "That url isn't a recognized stock media source", "invalid-source");
  }

  const bytes = await downloadMediaUrl(sourceUrl);
  const suggestedName = body?.name?.trim() || parsed.pathname.split("/").pop() || "stock-media";

  // Same "user's own account-wide library, not this project's storage" branch media/route.ts's own
  // upload handler and the AI generation routes all take — a stock download is just as reusable across
  // a user's other projects as an upload or a generation is.
  if (VCUT_HOSTED) {
    const user = await requireSessionUser(req);
    const profile = await getProfile(user.id);
    await checkStorageQuota(user.id, profile?.plan ?? "free", bytes.byteLength);
    const libraryPaths = ensureUserMediaDirs(user.id);
    const asset = await importMediaBytes(libraryPaths, bytes, suggestedName);
    if (asset.kind !== "video" && asset.kind !== "audio" && asset.kind !== "image") {
      throw new ApiError(500, "Unexpected asset kind from import", "unexpected-asset-kind");
    }
    await insertUserMedia(user.id, {
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      relPath: asset.relPath,
      thumbnailRelPath: asset.thumbnailRelPath ?? null,
      filmstripRelPath: asset.filmstripRelPath ?? null,
      waveformRelPath: asset.waveformRelPath ?? null,
      duration: asset.duration,
      width: asset.width ?? null,
      height: asset.height ?? null,
      fps: asset.fps ?? null,
      hasAudio: asset.hasAudio,
      sizeBytes: asset.sizeBytes,
      aiGeneration: null,
    });
    asset.libraryMediaId = asset.id;
    return Response.json({ asset });
  }

  const asset = await importMediaBytes(paths, bytes, suggestedName);
  return Response.json({ asset });
});
