import type { AssetKind } from "@veasna/vstudio/src/project/types";

/** Formats the importer accepts. Anything else is rejected up front with a clear message rather than
 *  handed to FFmpeg to fail on in a less obvious way.
 *
 *  Lives in `_lib` rather than in the media route because a Next.js route file may only export HTTP
 *  method handlers and a fixed set of config values — any other export is a type error. */
const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"]);
const AUDIO_EXTS = new Set([".wav", ".mp3", ".aac", ".flac", ".m4a", ".ogg"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export const SUPPORTED_EXTENSIONS = [...VIDEO_EXTS, ...AUDIO_EXTS, ...IMAGE_EXTS];

export function kindForExtension(ext: string): AssetKind | null {
  if (VIDEO_EXTS.has(ext)) return "video";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (IMAGE_EXTS.has(ext)) return "image";
  return null;
}
