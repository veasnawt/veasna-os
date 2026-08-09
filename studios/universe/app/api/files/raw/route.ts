import fs from "fs";
import path from "path";
import { isLocalRequest, localOnlyResponse } from "../../_lib/localOnlyGuard";
import { ApiError, ensureRoot, resolveSandboxed, errorResponse } from "../../_lib/sandboxedFs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Extension -> MIME type, for the handful of kinds the frontend actually knows how to preview
// (packages/universe/src/utils/fileTypes.ts) — anything else falls back to a generic binary type,
// which browsers handle fine for a plain download/open-in-new-tab link.
const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".pdf": "application/pdf",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
};

/** Serves real file bytes as-is — unlike the JSON `readFile` action in `../route.ts`, which forces
 *  a UTF-8 text decode (fine for source files, silently corrupting for anything binary). This is
 *  what image/audio/video/PDF previews and the "open in new tab" fallback actually load from. */
export async function GET(req: Request) {
  if (!isLocalRequest(req)) return localOnlyResponse();
  ensureRoot();
  const url = new URL(req.url);
  const relPath = url.searchParams.get("path") ?? "";
  try {
    const abs = resolveSandboxed(relPath);
    const stat = await fs.promises.stat(abs).catch(() => null);
    if (!stat) throw new ApiError(404, "File not found");
    if (!stat.isFile()) throw new ApiError(400, "Not a file");
    const data = await fs.promises.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(data.length),
        // Never cache — this sandbox is mutable (renames, edits, deletes), and a stale cached
        // image/PDF after a save would be a confusing, hard-to-explain bug.
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
