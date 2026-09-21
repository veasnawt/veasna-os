import fs from "fs";
import path from "path";
import { filterMusicCatalog, VIRAL_MUSIC_CATALOG, type MusicCategory, type MusicTrack } from "@veasnawt/vcut/src/project/music";
import { downloadMediaUrl, importMediaBytes } from "../_lib/importMedia";
import { corsPreflight, publicSessionRouteCors } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs, ensureUserMediaDirs } from "../_lib/paths";
import { sfxAssetPath } from "../_lib/sfx";
import { getProfile } from "../_lib/profiles";
import { checkStorageQuota, insertUserMedia } from "../_lib/userMedia";
import { VCUT_HOSTED } from "../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORY_SEARCH_TERMS: Record<string, string> = {
  all: "viral hits 2026",
  trending: "trending tiktok viral songs",
  upbeat: "upbeat energetic dance pop",
  phonk: "drift phonk bass night drive",
  lofi: "lofi hip hop chill beats study",
  cinematic: "epic cinematic trailer orchestral",
  pop: "top pop hits 2026",
  travel: "summer travel vlog acoustic chill",
};

async function resolvePlayableAudio(title: string, artist?: string): Promise<string | undefined> {
  try {
    const clean = `${title} ${artist ?? ""}`
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\(.*?\)|\[.*?\]|official|music|video|audio|lyrics/gi, "")
      .trim();
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(clean)}&entity=song&limit=1`;
    const res = await fetch(itunesUrl, { signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      const data = (await res.json()) as { results?: Array<{ previewUrl?: string }> };
      return data.results?.[0]?.previewUrl;
    }
  } catch {
    // Ignore fallback errors
  }
  return undefined;
}

/** `GET /api/vcut/music?q=...&category=...`
 *  Returns real music tracks from iTunes Search API and YouTube Data API, plus local curated tracks. */
export const GET = publicSessionRouteCors(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("availability")) {
    return Response.json({ available: true });
  }

  const category = (url.searchParams.get("category") ?? "all") as MusicCategory;
  const query = (url.searchParams.get("q") ?? "").trim();

  // 1. Get matching local tracks first (for instant response and offline fallback)
  const localTracks = filterMusicCatalog(category, query);

  // 2. Fetch from real iTunes / Apple Music search API
  const searchTerm = query || CATEGORY_SEARCH_TERMS[category] || "popular music";
  let externalTracks: MusicTrack[] = [];

  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=30`;
    const res = await fetch(itunesUrl, {
      headers: { "User-Agent": "VCut-Music/1.0" },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = (await res.json()) as { results?: Array<{
        trackId: number;
        trackName?: string;
        artistName?: string;
        previewUrl?: string;
        artworkUrl100?: string;
        trackTimeMillis?: number;
        primaryGenreName?: string;
      }> };

      if (Array.isArray(data.results)) {
        externalTracks = data.results
          .filter((item) => Boolean(item.previewUrl))
          .map((item) => ({
            id: `itunes-${item.trackId}`,
            title: item.trackName || "Untitled Track",
            artist: item.artistName || "Unknown Artist",
            category: (category === "all" ? "trending" : category) as Exclude<MusicCategory, "all">,
            duration: Math.round((item.trackTimeMillis || 30000) / 1000),
            bpm: undefined,
            tags: [item.primaryGenreName, "music"].filter(Boolean) as string[],
            audioUrl: item.previewUrl!,
            coverUrl: item.artworkUrl100 ? item.artworkUrl100.replace(/100x100bb/g, "300x300bb") : undefined,
            featured: false,
          }));
      }
    }
  } catch {
    // Network timeout or offline - gracefully proceed with local tracks
  }

  // 3. If YouTube Data API key is available (VCUT_HOSTED_YOUTUBE_API_KEY or YOUTUBE_API_KEY), query YouTube
  const youtubeApiKey = process.env.VCUT_HOSTED_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;
  if (youtubeApiKey) {
    try {
      const ytUrl = query
        ? `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&q=${encodeURIComponent(searchTerm + " song")}&key=${youtubeApiKey}&maxResults=12`
        : `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&videoCategoryId=10&key=${youtubeApiKey}&maxResults=12`;
      const ytRes = await fetch(ytUrl, { signal: AbortSignal.timeout(5000) });
      if (ytRes.ok) {
        const ytData = (await ytRes.json()) as { items?: Array<{
          id?: { videoId?: string } | string;
          snippet?: { title?: string; channelTitle?: string; thumbnails?: { high?: { url?: string } } };
        }> };

        if (Array.isArray(ytData.items)) {
          const ytPromises = ytData.items.map(async (i) => {
            const videoId = typeof i.id === "string" ? i.id : i.id?.videoId;
            if (!videoId) return null;
            const rawTitle = i.snippet?.title || "YouTube Track";
            const cleanTitle = rawTitle.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
            const artistName = (i.snippet?.channelTitle || "YouTube").replace(/ - Topic$/i, "");
            let audioPreview = await resolvePlayableAudio(cleanTitle, artistName);
            if (!audioPreview) {
              audioPreview = await resolvePlayableAudio(cleanTitle);
            }
            if (!audioPreview) return null; // Only keep tracks that have playable audio streams
            return {
              id: `yt-${videoId}`,
              title: cleanTitle,
              artist: artistName,
              category: (category === "all" ? "trending" : category) as Exclude<MusicCategory, "all">,
              duration: 180,
              tags: ["youtube", "trending"],
              audioUrl: audioPreview,
              coverUrl: i.snippet?.thumbnails?.high?.url,
              featured: false,
            };
          });
          const ytTracks = (await Promise.all(ytPromises)).filter(Boolean) as MusicTrack[];
          externalTracks = [...externalTracks, ...ytTracks];
        }
      }
    } catch {
      // Ignore YouTube API errors
    }
  }

  // Combine: prioritize live external tracks (real songs from iTunes & YouTube)
  // Real songs come first; local catalog acts as an instant/offline fallback.
  const seenTitles = new Set<string>();
  const combined: MusicTrack[] = [];

  const listToMerge = externalTracks.length > 0 ? [...externalTracks, ...localTracks] : localTracks;

  for (const track of listToMerge) {
    const key = `${track.title.toLowerCase()}::${track.artist.toLowerCase()}`;
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      combined.push(track);
    }
  }

  return Response.json({ tracks: combined });
});

/** `POST /api/vcut/music?projectId=...`
 *  Downloads the requested music track and imports it into the project (or user media library). */
export const POST = publicSessionRouteCors(async (req, user) => {
  const bpProjectId = new URL(req.url).searchParams.get("projectId");
  const body = (await req.json().catch(() => ({}))) as {
    trackId?: string;
    audioUrl?: string;
    title?: string;
    artist?: string;
    deliverBytes?: boolean;
  };

  if (!body.trackId && !body.audioUrl) {
    throw new ApiError(400, "Missing trackId or audioUrl", "missing-track");
  }

  // Find track in catalog or use provided metadata
  const catalogTrack = VIRAL_MUSIC_CATALOG.find((t) => t.id === body.trackId);
  let audioUrl = body.audioUrl || catalogTrack?.audioUrl;
  const title = body.title || catalogTrack?.title || "Music Track";
  const artist = body.artist || catalogTrack?.artist || "Unknown Artist";

  if (!audioUrl) {
    throw new ApiError(404, "Track audio URL not found", "track-not-found");
  }

  // If the audio URL points to YouTube or isn't a direct audio file, resolve playable audio stream
  if (audioUrl.includes("youtube.com") || !audioUrl.match(/\.(mp3|m4a|aac|wav|ogg)/i)) {
    const preview = await resolvePlayableAudio(title, artist);
    if (preview) {
      audioUrl = preview;
    }
  }

  const paths = bpProjectId ? ensureProjectDirs(bpProjectId) : null;
  const userMedia = VCUT_HOSTED && user?.id ? ensureUserMediaDirs(user.id) : null;

  const writeTarget = userMedia ?? paths;
  if (!writeTarget) {
    throw new ApiError(400, "Missing projectId", "missing-project-id");
  }

  const ext = audioUrl.includes(".m4a") || audioUrl.includes(".aac") ? ".m4a" : audioUrl.includes(".wav") ? ".wav" : ".mp3";
  const safeTitle = title.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim() || "Track";
  const safeArtist = artist.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim() || "Artist";
  const cleanFilename = `${safeTitle} - ${safeArtist}${ext}`;

  // Load the music track bytes (either from local assets or via download)
  let bytes: Buffer;
  if (audioUrl.startsWith("/api/vcut/sfx/") || audioUrl.startsWith("/api/vcut/music/file/") || !audioUrl.startsWith("http")) {
    const fileName = path.basename(audioUrl.split("?")[0]);
    try {
      const filePath = sfxAssetPath(fileName);
      bytes = fs.readFileSync(filePath);
    } catch {
      bytes = await downloadMediaUrl(audioUrl);
    }
  } else {
    bytes = await downloadMediaUrl(audioUrl);
  }

  if (VCUT_HOSTED && user?.id) {
    const profile = await getProfile(user.id);
    await checkStorageQuota(user.id, profile?.plan ?? "free", bytes.byteLength);
  }

  const asset = await importMediaBytes(writeTarget, bytes, cleanFilename);

  if (userMedia && user?.id) {
    await insertUserMedia(user.id, {
      id: asset.id,
      kind: "audio",
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
      hidden: false,
    });
    asset.libraryMediaId = asset.id;
  }

  const bytesBase64 = body.deliverBytes ? bytes.toString("base64") : undefined;
  return Response.json({ asset, ...(bytesBase64 ? { bytesBase64 } : null) });
});

export const OPTIONS = corsPreflight;

