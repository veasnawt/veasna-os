import fs from "fs";
import os from "os";
import path from "path";
import { MAX_ANIMATION_SECONDS, planAnimation, spriteGrid, type AssetStickerSource } from "@veasnawt/vcut/src/project/stickers";
import type { Asset } from "@veasnawt/vcut/src/project/types";
import {
  convertToAnimatedPng,
  extractFirstFramePng,
  generateFilmstrip,
  generateSpriteSheet,
  generateThumbnail,
  generateWaveform,
  probeAnimatedImage,
  probeMedia,
  remuxForDuration,
} from "./ffmpeg";
import { kindForExtension } from "./mediaFormats";
import { ApiError, resolveWithin, uniqueFileName } from "./paths";

/** The only two fields this function actually touches — deliberately narrower than either
 *  `ProjectPaths` or `UserMediaPaths` (both of which structurally satisfy this on their own, no
 *  adapter needed) so the SAME function writes either into a project's own media folder or into a
 *  user's account-wide library depending only on which paths object the caller happens to pass in.
 *  See `media/route.ts`'s own `POST` handler for the hosted-mode branch that picks between the two. */
export interface MediaWriteTarget {
  mediaDir: string;
  thumbnailsDir: string;
}

/** Turns raw bytes already known to represent one media file into a real `Asset` — the "write to
 *  disk, probe, generate thumbnail/filmstrip/waveform, build the Asset record" pipeline that used to
 *  live only inline in `media/route.ts`'s own `POST` handler. Extracted here once a SECOND caller
 *  (stock media import, `stock/route.ts`) needed the identical steps, and a THIRD (AI image/video
 *  generation) made three separately hand-maintained copies clearly the wrong call — `media/route.ts`
 *  itself now calls this too, so there is exactly one place this logic can drift.
 *
 *  `suggestedName` only ever supplies the file's extension (to classify `kind`) and the Asset's own
 *  display `name` — the actual on-disk filename is always freshly randomized via `uniqueFileName`
 *  regardless of what a remote source happened to call it, same guarantee the original inline version
 *  already gave uploaded files. */
export async function importMediaBytes(paths: MediaWriteTarget, bytes: Buffer, suggestedName: string): Promise<Asset> {
  const ext = path.extname(suggestedName).toLowerCase();
  const kind = kindForExtension(ext);
  if (!kind) throw new ApiError(400, `VCut can't import "${ext || suggestedName}"`, "unsupported-format");

  const fileName = uniqueFileName(suggestedName);
  const destination = resolveWithin(paths.mediaDir, fileName);
  fs.writeFileSync(destination, bytes);

  let probe;
  try {
    probe = await probeMedia(destination);
  } catch (err) {
    // Don't leave an unreadable file sitting in the project folder if it turned out not to be media.
    fs.rmSync(destination, { force: true });
    throw err;
  }

  // Same MediaRecorder-style duration-less-but-real-stream recovery `media/route.ts` already relied
  // on — a remote source can produce exactly the same shape of file (a provider's own encoder quirk),
  // so this stays even though the ORIGINAL motivating case (a browser-captured voiceover) is specific
  // to uploads.
  if (kind !== "image" && probe.duration <= 0 && (probe.hasAudio || probe.hasVideo)) {
    const fixed = await remuxForDuration(destination);
    if (fixed) probe = fixed;
  }
  if (kind !== "image" && probe.duration <= 0) {
    fs.rmSync(destination, { force: true });
    throw new ApiError(400, "That file contains no playable audio or video", "empty-media");
  }

  const resolvedKind = kind === "video" && !probe.hasVideo && probe.hasAudio ? "audio" : kind;

  const asset: Asset = {
    id: `a_${crypto.randomUUID().slice(0, 8)}`,
    kind: resolvedKind,
    name: suggestedName,
    relPath: fileName,
    duration: probe.duration,
    hasAudio: probe.hasAudio,
    sizeBytes: bytes.byteLength,
    importedAt: Date.now(),
    ...(probe.width ? { width: probe.width } : null),
    ...(probe.height ? { height: probe.height } : null),
    ...(probe.fps ? { fps: probe.fps } : null),
  };

  if (resolvedKind === "video") {
    const thumbName = `${asset.id}.jpg`;
    const at = Math.min(1, probe.duration / 2);
    if (await generateThumbnail(destination, resolveWithin(paths.thumbnailsDir, thumbName), at)) asset.thumbnailRelPath = thumbName;
    const filmstripName = `${asset.id}-filmstrip.jpg`;
    if (await generateFilmstrip(destination, resolveWithin(paths.thumbnailsDir, filmstripName), probe.duration)) {
      asset.filmstripRelPath = filmstripName;
    }
  }
  if (resolvedKind === "audio") {
    const waveformName = `${asset.id}-waveform.png`;
    if (await generateWaveform(destination, resolveWithin(paths.thumbnailsDir, waveformName))) asset.waveformRelPath = waveformName;
  }

  return asset;
}

/** Turns a downloaded sticker or GIF (the Stickers tool — always the provider's GIF rendition, which
 *  every FFmpeg build here can decode) into an ANIMATED image asset: a looping animated PNG at
 *  `relPath` for export, plus the preview sprite sheet and frame timing in `Asset.animation` (see
 *  `stickers.ts`). A source with a single frame comes out as an ordinary still PNG instead. Hidden from
 *  the media library — it's reached again through the Stickers tool, and a library row can't carry
 *  `animation`, so re-adding it from there would place a still. */
export async function importAnimatedImageBytes(
  paths: MediaWriteTarget,
  bytes: Buffer,
  suggestedName: string,
  stickerSource: AssetStickerSource
): Promise<Asset> {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "vcut-sticker-"));
  const created: string[] = [];
  try {
    const sourcePath = path.join(workDir, `source${path.extname(suggestedName).toLowerCase() || ".gif"}`);
    fs.writeFileSync(sourcePath, bytes);
    const probe = await probeAnimatedImage(sourcePath);
    const baseName = `${path.basename(suggestedName, path.extname(suggestedName)) || "sticker"}.png`;

    if (probe.frames < 2) {
      const stillPath = path.join(workDir, "still.png");
      await extractFirstFramePng(sourcePath, stillPath);
      const asset = await importMediaBytes(paths, fs.readFileSync(stillPath), baseName);
      return { ...asset, hiddenFromLibrary: true, stickerSource };
    }

    const plan = planAnimation(probe);
    const fileName = uniqueFileName(baseName);
    const destination = resolveWithin(paths.mediaDir, fileName);
    created.push(destination);
    await convertToAnimatedPng(sourcePath, destination, plan, MAX_ANIMATION_SECONDS);

    // Resampling can land a frame off the plan; the sprite sheet and timing follow what's really there.
    const frameCount = (await probeAnimatedImage(destination)).frames;
    if (frameCount < 2) throw new ApiError(400, "That sticker has no animation to import", "sticker-empty");
    const grid = spriteGrid(frameCount, plan.exportWidth, plan.exportHeight);

    const id = `a_${crypto.randomUUID().slice(0, 8)}`;
    const spriteRelPath = `${id}-sprite.webp`;
    const spritePath = resolveWithin(paths.thumbnailsDir, spriteRelPath);
    created.push(spritePath);
    await generateSpriteSheet(destination, spritePath, grid);

    return {
      id,
      kind: "image",
      name: suggestedName,
      relPath: fileName,
      duration: 0,
      width: plan.exportWidth,
      height: plan.exportHeight,
      hasAudio: false,
      sizeBytes: fs.statSync(destination).size + fs.statSync(spritePath).size,
      importedAt: Date.now(),
      hiddenFromLibrary: true,
      animation: { frameCount, fps: plan.fps, spriteRelPath, ...grid },
      stickerSource,
    };
  } catch (err) {
    for (const file of created) fs.rmSync(file, { force: true });
    throw err;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/** Downloads a remote URL's bytes for `importMediaBytes` — both the stock-search-result case
 *  (Pixabay's own CDN URL) and the AI-generation-result case (Replicate's own output URL) start from
 *  a provider-hosted URL rather than an uploaded `File`. `maxBytes` guards against an unexpectedly
 *  huge response (a provider bug, or a redirect landing on something other than the promised media)
 *  consuming unbounded memory — checked against `content-length` up front where the provider sends
 *  one, and again against the real downloaded size regardless (a provider can omit or lie about that
 *  header). */
export async function downloadMediaUrl(url: string, maxBytes = 200 * 1024 * 1024): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new ApiError(502, "Could not download that file", "download-failed");
  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) throw new ApiError(400, "That file is too large to import", "download-too-large");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new ApiError(400, "That file is too large to import", "download-too-large");
  return buf;
}
