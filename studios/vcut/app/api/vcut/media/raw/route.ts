import fs from "fs";
import path from "path";
import { requireSessionUser, VCUT_HOSTED } from "../../_lib/auth";
import { localRoute } from "../../_lib/localOnly";
import { ApiError, projectPaths, resolveWithin, userMediaPaths } from "../../_lib/paths";

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
  // A `.cube` LUT is plain ASCII text (see `timeline/lut.ts`'s `parseCubeLut`) — served through this
  // same route (`kind=lut`) rather than a dedicated one, since every Range/ETag/caching concern below
  // applies to it identically, and `PlaybackEngine.lutUrlFor` just needs a fetchable URL, not anything
  // LUT-specific from the route itself.
  ".cube": "text/plain",
  // A user-imported custom font (`kind=customFont`) — same "reuse this route rather than a dedicated
  // one" reasoning as `.cube` above; the browser's `@font-face`/`FontFace` API just needs a fetchable
  // URL, and `.otf`'s `font/otf` MIME type matters for some strict UAs even though most accept either
  // extension under either type.
  ".ttf": "font/ttf",
  ".otf": "font/otf",
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
  const kind =
    kindParam === "thumbnail" || kindParam === "export" || kindParam === "lut" || kindParam === "customFont" || kindParam === "customSfx"
      ? kindParam
      : "media";
  if (!projectId || !relPath) throw new ApiError(400, "Missing projectId or relPath", "missing-params");

  // `library=1` means this file lives in the CURRENT user's account-wide library
  // (`users/<id>/media`/`.../thumbnails`), not this project's own folder — see
  // `Asset.libraryMediaId`'s own doc comment. `projectId` is still required and still checked above
  // (via `localRoute`'s own ownership check) even for a library file, since it's what anchors this
  // request to a real project the caller actually owns in the first place; the library directory
  // resolved below always belongs to that SAME owner; only `kind === "media" | "thumbnail"` ever apply
  // to a library file (no library-only export/lut/font/sfx concept exists).
  const isLibrary = url.searchParams.get("library") === "1";
  let baseDir: string;
  if (isLibrary) {
    if (!VCUT_HOSTED) throw new ApiError(400, "Library media isn't available here", "library-unavailable");
    const user = await requireSessionUser(req);
    const libraryPaths = userMediaPaths(user.id);
    baseDir = kind === "thumbnail" ? libraryPaths.thumbnailsDir : libraryPaths.mediaDir;
  } else {
    const paths = projectPaths(projectId);
    baseDir =
      kind === "thumbnail"
        ? paths.thumbnailsDir
        : kind === "export"
          ? paths.exportsDir
          : kind === "lut"
            ? paths.lutsDir
            : kind === "customFont"
              ? paths.customFontsDir
              : kind === "customSfx"
                ? paths.customSfxDir
                : paths.mediaDir;
  }
  const filePath = resolveWithin(baseDir, relPath);

  if (!fs.existsSync(filePath)) {
    // The distinct code is what lets the UI show "Media Offline" with a Relink action instead of a
    // generic failure — see the spec's file-safety requirement.
    throw new ApiError(404, "Media file is missing", "media-offline");
  }

  const stat = fs.statSync(filePath);
  const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
  const rangeHeader = req.headers.get("range");

  // Content at a given `relPath` is effectively immutable: `uniqueFileName` (see `_lib/paths.ts`)
  // always assigns a fresh random-suffixed name on import, and nothing ever overwrites an existing
  // relPath's bytes in place — a relink or re-import produces a new relPath, not a rewrite of this
  // one. So unlike the old blanket `no-store`, this is safe to cache hard, keyed off an ETag derived
  // from size+mtime (no content hashing — cheap) rather than a content hash. `must-revalidate` still
  // makes the browser check back after the week is up instead of serving indefinitely-stale bytes in
  // the rare case a file WAS replaced out from under an unchanged relPath (e.g. manual disk surgery).
  const etag = `"${stat.mtimeMs}-${stat.size}"`;
  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=604800, must-revalidate",
    ETag: etag,
  };

  if (req.headers.get("if-none-match") === etag) {
    // No need to even open the file — the client already has these exact bytes cached.
    return new Response(null, { status: 304, headers: baseHeaders });
  }

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
