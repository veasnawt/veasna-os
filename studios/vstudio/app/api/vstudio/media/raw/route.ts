import fs from "fs";
import path from "path";
import { localRoute } from "../../_lib/localOnly";
import { ApiError, projectPaths, resolveWithin } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".aac": "audio/aac",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Streams a file from disk with HTTP Range support.
 *
 *  Range handling is not optional here: a `<video>` element will not let the user seek in a resource
 *  the server can't serve partially. Without a 206 response the preview would only ever play from
 *  the start, which makes scrubbing — the single most-used interaction in an editor — impossible. */
export const GET = localRoute(async (req) => {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const relPath = url.searchParams.get("relPath");
  const kindParam = url.searchParams.get("kind");
  const kind = kindParam === "thumbnail" || kindParam === "export" ? kindParam : "media";
  if (!projectId || !relPath) throw new ApiError(400, "Missing projectId or relPath", "missing-params");

  const paths = projectPaths(projectId);
  const baseDir =
    kind === "thumbnail" ? paths.thumbnailsDir : kind === "export" ? paths.exportsDir : paths.mediaDir;
  const filePath = resolveWithin(baseDir, relPath);

  if (!fs.existsSync(filePath)) {
    // The distinct code is what lets the UI show "Media Offline" with a Relink action instead of a
    // generic failure — see the spec's file-safety requirement.
    throw new ApiError(404, "Media file is missing", "media-offline");
  }

  const stat = fs.statSync(filePath);
  const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
  const rangeHeader = req.headers.get("range");

  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    // Local files served to a local editor: caching them buys nothing and risks showing stale media
    // after a relink or re-import.
    "Cache-Control": "no-store",
  };

  if (!rangeHeader) {
    return new Response(toWebStream(fs.createReadStream(filePath)), {
      status: 200,
      headers: { ...baseHeaders, "Content-Length": String(stat.size) },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
  }

  // Both `bytes=500-` (open-ended) and `bytes=-500` (suffix) are legal and both are used by real
  // browsers while seeking.
  const [, startRaw, endRaw] = match;
  let start: number;
  let end: number;
  if (startRaw === "") {
    const suffixLength = Number(endRaw);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
    start = Math.max(0, stat.size - suffixLength);
    end = stat.size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === "" ? stat.size - 1 : Number(endRaw);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stat.size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
  }
  end = Math.min(end, stat.size - 1);

  return new Response(toWebStream(fs.createReadStream(filePath, { start, end })), {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Content-Length": String(end - start + 1),
    },
  });
});

/** Bridges a Node read stream to the Web `ReadableStream` a `Response` expects, propagating cancel
 *  so a seek that abandons an in-flight request doesn't leave a file handle open. */
function toWebStream(nodeStream: fs.ReadStream): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}
