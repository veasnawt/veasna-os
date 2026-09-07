import fs from "fs";
import { publicAssetRoute } from "../../../../_lib/localOnly";
import { ApiError, ensureProjectDirs, resolveWithin } from "../../../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A CHUNKED job's own scratch files (`runChunkedInpaintPrediction`) use `<uuid>-chunk<N>` as their
// "job id" for URL-construction purposes, not a bare UUID — confirmed LIVE as a real regression this
// regex caused once chunking shipped: any clip over 5 seconds got routed through chunking, and every
// chunk's own scratch-file fetch was rejected with a 400 (this regex simply never matched), which
// Bria's backend then reported as the exact same "Failed to load video" 422 the ORIGINAL (pre-faststart)
// bug did — a completely different root cause producing an identical-looking symptom.
const JOB_FILE_RE = /^[0-9a-f-]{36}(?:-chunk\d+)?-(?:src|mask)\.mp4$/i;

/** Serves a running Remove Object job's own scratch VIDEO or MASK file (never anything else in the
 *  project) to an external caller — specifically `bria/video-erase-object`'s own backend, confirmed
 *  LIVE (a plain unauthenticated `curl` to Replicate's own Files API delivery URL returns 403) to be
 *  unable to fetch a Replicate-hosted file the way `runInpaintPrediction`'s ORIGINAL approach assumed
 *  it could. Bria's model runs as a partner-hosted integration, not literally inside Replicate's own
 *  GPU fleet with implicit access to Replicate's private file storage — its `video_url`/`mask_url`
 *  inputs need a genuinely public URL its own servers can fetch with no credential at all, which is
 *  exactly what this route is. Hosted-mode only (see `runInpaintPrediction`'s own `VCUT_HOSTED`
 *  branch) — this only works because vcut.io is genuinely internet-reachable, which a local/desktop
 *  dev server is not.
 *
 *  Scoped to one job's own random UUID (`crypto.randomUUID()`, same as the job's own id) — effectively
 *  a bearer capability, the same trust model a pre-signed URL would use, and short-lived: the files
 *  this points at are deleted the moment the job finishes, win or lose (`runInpaintJob`'s own
 *  `finally`). `publicAssetRoute` deliberately skips auth in hosted mode for exactly this reason —
 *  an external model's backend has no VCut session to present, and there's nothing per-user worth
 *  protecting behind one anyway once the job that made these files is done. */
export const GET = publicAssetRoute(async (req: Request, context: { params: Promise<{ projectId: string; jobFile: string }> }) => {
  const { projectId, jobFile } = await context.params;
  const match = JOB_FILE_RE.exec(jobFile);
  if (!match) throw new ApiError(400, "Invalid scratch file reference", "bad-request");

  const paths = ensureProjectDirs(projectId);
  const filePath = resolveWithin(paths.scratchDir, jobFile);
  if (!fs.existsSync(filePath)) throw new ApiError(404, "That job's file is no longer available", "scratch-file-missing");

  const stat = fs.statSync(filePath);
  // Range support alongside `-movflags +faststart` (see `buildExtractClipArgs`'s own comment) —
  // `faststart` means a sequential read no longer NEEDS seeking, but a decoder is still free to
  // issue Range requests (many do, to probe size or read ahead), and answering those with a plain
  // 200 + the whole body instead of a proper 206 is itself something a strict remote decoder could
  // choke on. `Accept-Ranges: bytes` on every response (not just when a Range was requested)
  // advertises that up front.
  const range = req.headers.get("range");
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      if (start < stat.size && end < stat.size && start <= end) {
        const fd = fs.openSync(filePath, "r");
        const buf = Buffer.alloc(end - start + 1);
        fs.readSync(fd, buf, 0, buf.length, start);
        fs.closeSync(fd);
        return new Response(new Uint8Array(buf), {
          status: 206,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Range": `bytes ${start}-${end}/${stat.size}`,
            "Content-Length": String(buf.length),
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store",
          },
        });
      }
    }
  }

  return new Response(new Uint8Array(fs.readFileSync(filePath)), {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    },
  });
});
