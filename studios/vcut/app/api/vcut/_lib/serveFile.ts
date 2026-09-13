import fs from "fs";

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

/** Streams a file from disk with HTTP Range support — factored out of `media/raw/route.ts`'s own GET
 *  handler (still the primary caller) once a second route (`templates/[id]/preview/route.ts`) needed
 *  the identical byte-range/ETag/streaming behavior for a genuinely different resource (a template's
 *  preview clip, not a project/library media file — different ownership check, different path
 *  resolution entirely, but once a real `filePath` and `contentType` are in hand, serving it is exactly
 *  the same problem either way).
 *
 *  Range handling is not optional here: a `<video>` element will not let the user seek in a resource
 *  the server can't serve partially. Without a 206 response the preview would only ever play from the
 *  start, which makes scrubbing impossible.
 *
 *  Caches hard (`cacheControl`, caller-supplied — a plain per-project media file and a template
 *  preview have different "how long is this safe to cache" answers, see each caller's own reasoning)
 *  keyed off an ETag derived from size+mtime (no content hashing — cheap), with `must-revalidate` so
 *  a stale cache still checks back rather than serving indefinitely-wrong bytes in the rare case the
 *  file WAS replaced out from under an unchanged path. */
export function serveFileWithRange(req: Request, filePath: string, contentType: string, cacheControl: string): Response {
  const stat = fs.statSync(filePath);
  const rangeHeader = req.headers.get("range");

  const etag = `"${stat.mtimeMs}-${stat.size}"`;
  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControl,
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
}
