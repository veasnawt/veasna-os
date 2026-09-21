import fs from "fs";
import path from "path";
import { filterMusicCatalog, VIRAL_MUSIC_CATALOG, type MusicCategory, type MusicTrack } from "@veasnawt/vcut/src/project/music";
import { downloadMediaUrl, importMediaBytes } from "../_lib/importMedia";
import { corsPreflight, hostedSessionRouteCors } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs, ensureUserMediaDirs } from "../_lib/paths";
import { sfxAssetPath } from "../_lib/sfx";
import { getProfile } from "../_lib/profiles";
import { checkStorageQuota, insertUserMedia } from "../_lib/userMedia";
import { VCUT_HOSTED } from "../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/vcut/music?q=...&category=...`
 *  Returns filtered viral & trending music catalog entries. */
export const GET = hostedSessionRouteCors(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("availability")) {
    return Response.json({ available: true });
  }

  const category = (url.searchParams.get("category") ?? "all") as MusicCategory;
  const query = url.searchParams.get("q") ?? "";

  const tracks = filterMusicCatalog(category, query);
  return Response.json({ tracks });
});

/** `POST /api/vcut/music?projectId=...`
 *  Downloads the requested music track and imports it into the project (or user media library). */
export const POST = hostedSessionRouteCors(async (req, user) => {
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
  const audioUrl = body.audioUrl || catalogTrack?.audioUrl;
  const title = body.title || catalogTrack?.title || "Music Track";
  const artist = body.artist || catalogTrack?.artist || "Unknown Artist";

  if (!audioUrl) {
    throw new ApiError(404, "Track audio URL not found", "track-not-found");
  }

  const paths = bpProjectId ? ensureProjectDirs(bpProjectId) : null;
  const userMedia = VCUT_HOSTED && user?.id ? ensureUserMediaDirs(user.id) : null;

  const writeTarget = userMedia ?? paths;
  if (!writeTarget) {
    throw new ApiError(400, "Missing projectId", "missing-project-id");
  }

  const cleanFilename = `${title.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim()} - ${artist.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim()}.mp3`;

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

