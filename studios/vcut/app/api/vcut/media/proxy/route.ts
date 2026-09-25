import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import { buildProxyArgs, isProxyRelPath, proxyRelPathFor } from "@veasnawt/vcut/src/export/proxyCommands";
import { requireSessionUser, VCUT_HOSTED } from "../../_lib/auth";
import { beginHeavyFfmpegJob, endHeavyFfmpegJob, MAX_CONCURRENT_HOSTED_EXPORTS, waitForFfmpegHeadroom } from "../../_lib/ffmpegConcurrency";
import { ffmpegBinary, probeMedia } from "../../_lib/ffmpeg";
import { localRoute } from "../../_lib/localOnly";
import { ApiError, projectPaths, resolveWithin, userMediaPaths } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Longest a proxy is allowed to take before it is abandoned. */
const PROXY_TIMEOUT_MS = 20 * 60 * 1000;
/** Proxies currently being made, so a second request for the same file (a second tab, a retry) waits for the
 *  first instead of running FFmpeg twice into the same output. */
const inFlight = new Map<string, Promise<void>>();

async function runProxyFfmpeg(input: string, output: string, fps: number | undefined): Promise<void> {
  const partial = `${output}.partial.mp4`;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegBinary(), buildProxyArgs(input, partial, fps), { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-2000)));
    const timer = setTimeout(() => child.kill("SIGKILL"), PROXY_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().split("\n").pop() ?? ""}`));
    });
  }).catch((err) => {
    fs.rmSync(partial, { force: true });
    throw err;
  });
  // Renamed only once complete, so a request that arrives mid-encode never serves a half-written file.
  fs.renameSync(partial, output);
}

/** `POST /api/vcut/media/proxy?projectId=...` `{ relPath, library? }` — makes (or returns the existing) preview
 *  proxy for a video the browser reported it couldn't play. Returns `{ proxyRelPath }`, stored next to the
 *  original and served by `media/raw` exactly like any other media file. Export never uses it: FFmpeg reads the
 *  original. */
export const POST = localRoute(async (req) => {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const body = (await req.json().catch(() => null)) as { relPath?: unknown; library?: unknown } | null;
  const relPath = typeof body?.relPath === "string" ? body.relPath : "";
  const isLibrary = body?.library === true;
  if (!relPath || (!projectId && !isLibrary)) throw new ApiError(400, "Missing projectId or relPath", "missing-params");
  if (isProxyRelPath(relPath)) throw new ApiError(400, "That file is already a proxy", "already-proxy");

  let mediaDir: string;
  if (isLibrary) {
    if (!VCUT_HOSTED) throw new ApiError(400, "Library media isn't available here", "library-unavailable");
    mediaDir = userMediaPaths((await requireSessionUser(req)).id).mediaDir;
  } else {
    mediaDir = projectPaths(projectId!).mediaDir;
  }

  const source = resolveWithin(mediaDir, relPath);
  if (!fs.existsSync(source)) throw new ApiError(404, "Media file is missing", "media-offline");
  const proxyRelPath = proxyRelPathFor(relPath);
  const output = resolveWithin(mediaDir, proxyRelPath);
  if (fs.existsSync(output)) return Response.json({ proxyRelPath });

  const key = path.resolve(output);
  let job = inFlight.get(key);
  if (!job) {
    job = (async () => {
      // Shares the export concurrency ceiling on the hosted server: a proxy is real transcoding work, and this
      // container's memory is sized for a couple of heavy FFmpeg jobs at once.
      if (VCUT_HOSTED) await waitForFfmpegHeadroom(MAX_CONCURRENT_HOSTED_EXPORTS);
      beginHeavyFfmpegJob();
      try {
        const probe = await probeMedia(source).catch(() => null);
        await runProxyFfmpeg(source, output, probe?.fps);
      } finally {
        endHeavyFfmpegJob();
      }
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  try {
    await job;
  } catch (err) {
    console.error("[vcut] proxy: could not create a preview copy of", relPath, err);
    throw new ApiError(500, "Couldn't prepare a preview copy of that video", "proxy-failed");
  }
  return Response.json({ proxyRelPath });
});
