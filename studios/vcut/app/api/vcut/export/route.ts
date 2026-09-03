import type { ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { buildExportPlan, containsKhmerScript } from "@veasnawt/vcut/src/export/buildExportPlan";
import { renderKhmerClipWindows, type KhmerTextWindow } from "@veasnawt/vcut/src/export/khmerTextRenderer";
import { sequenceDuration } from "@veasnawt/vcut/src/project/createProject";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import { isIdentityTextCrop, type Project } from "@veasnawt/vcut/src/project/types";
import type { Clip } from "@veasnawt/vcut/src/project/types";
import { hasTextCropKeyframes, hasTextStyleKeyframes } from "@veasnawt/vcut/src/timeline/keyframes";
import { buildCustomFontDataUrls, openKhmerTextHarness } from "../_lib/khmerTextHarness";
import { ffmpegAvailable, fontMetricsFor, fontsDirPath, runFfmpeg, textFontPath } from "../_lib/ffmpeg";
import { localRoute } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs, type ProjectPaths, resolveWithin } from "../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JobStatus = "running" | "done" | "failed" | "cancelled";

/** `preparing`/`rendering-text` cover everything BEFORE FFmpeg exists to report real numeric
 *  progress — the Khmer pre-pass's own headless-Chromium launch and per-window rendering, which used
 *  to leave the client staring at a static, unexplained "0%" for however long that took (measured
 *  directly at 15-40+ seconds on this app's own machine). `job.message` carries a human-readable
 *  status for exactly those two phases; `encoding` is everything after, where `job.progress` is the
 *  real, meaningful number and the UI goes back to showing a percentage. */
type JobPhase = "preparing" | "rendering-text" | "encoding";

interface ExportJob {
  id: string;
  bpProjectId: string;
  status: JobStatus;
  phase: JobPhase;
  message?: string;
  progress: number;
  outputPath: string;
  fileName: string;
  error?: string;
  /** Doesn't exist until `phase` reaches `encoding` — cancelling any earlier phase (see `DELETE`
   *  below) has no live process to kill, only this flag to check between the pre-pass's own awaits. */
  process?: ChildProcess;
  /** Checked between each `await` in the pre-pass (there's no child process to kill yet there — see
   *  `process`'s own comment) so `DELETE` can still cancel a job that hasn't reached FFmpeg yet,
   *  instead of leaving it to run to completion unstoppably just because it started slow. */
  cancelRequested: boolean;
  /** Resolved whenever progress or status changes, so the SSE stream can wait for real news instead
   *  of polling on a timer. Replaced on every change — waiters take a fresh one each loop. */
  changed: Promise<void>;
  notify: () => void;
}

/** Jobs live in module memory for the lifetime of the server process. That's the right scope for a
 *  local, single-user editor: an export belongs to the running app, and if the server restarts
 *  mid-export the child process dies with it anyway, so there'd be nothing for a persisted record to
 *  point at. (In `next dev`, a hot reload can replace this module and orphan the map — the FFmpeg
 *  child is still killed on process exit, and the UI surfaces the lost job rather than hanging.) */
const jobs = new Map<string, ExportJob>();

function makeNotifier(job: Partial<ExportJob>): { changed: Promise<void>; notify: () => void } {
  let resolve!: () => void;
  const changed = new Promise<void>((r) => (resolve = r));
  return {
    changed,
    notify: () => {
      resolve();
      const next = makeNotifier(job);
      (job as ExportJob).changed = next.changed;
      (job as ExportJob).notify = next.notify;
    },
  };
}

/** Starts an export and returns immediately with a job id — BEFORE the Khmer pre-pass or FFmpeg
 *  itself have done any real work, not just before FFmpeg finishes. Everything that actually takes
 *  time happens in `runExportJob`, fired here without an `await`: the response returns the instant
 *  the job is registered, so the client can start watching its SSE stream right away and see real
 *  status the whole time, instead of only learning a job exists once the pre-pass has already
 *  finished — which used to leave the dialog showing a static, unexplained "0%" for however long
 *  that took (measured directly at 15-40+ seconds on this app's own machine for a project with
 *  Khmer text). The render itself runs in a child process, so the UI thread and the server's event
 *  loop both stay responsive throughout either way. */
export const POST = localRoute(async (req) => {
  const url = new URL(req.url);
  const bpProjectId = url.searchParams.get("projectId");
  if (!bpProjectId) throw new ApiError(400, "Missing projectId", "missing-project-id");

  // Rejected up front, before any of the heavy work below (the Khmer pre-pass's own headless
  // Chromium launch, then FFmpeg itself) even starts — a SECOND export request for a project that
  // already has one running is never a legitimate "export something else too," it's a double-submit:
  // a repeated click while the dialog looked unresponsive, a second tab on the same project, or a
  // retry after a slow response the first request was actually going to answer just fine. Letting it
  // through used to stack a whole extra Chromium + FFmpeg process on top of the first, both fighting
  // the same machine for CPU/RAM — confirmed directly as a real path to the whole OS bogging down, not
  // just this one export: every repeated click while nothing seemed to be happening spawned yet
  // another pair of heavy processes rather than either reusing or replacing the one already in
  // flight. The existing job's own SSE stream already tells a client everything it needs to keep
  // watching, so there's nothing this loses for the legitimate case.
  //
  // The check AND the registration below have to happen in the same synchronous stretch of code,
  // with no `await` between them — confirmed directly as necessary, not just tidy, by firing two
  // requests for the same project at once and watching BOTH sail through when `jobs.set()` for a
  // real job only happened after several `await`s: two requests racing in could each check "is
  // anything running?", each see "no" (neither had registered yet), and both proceed — exactly the
  // double-submit this exists to stop, just delayed instead of prevented. Registering the job here,
  // before this function's first `await`, closes that window: JS has no thread interleaving
  // mid-synchronous-statement, so whichever request reaches this line first claims the slot before
  // the second one's own check can possibly run.
  for (const existing of jobs.values()) {
    if (existing.bpProjectId === bpProjectId && existing.status === "running") {
      throw new ApiError(409, "An export is already running for this project", "export-already-running");
    }
  }
  const id = crypto.randomUUID();
  const job = {
    id,
    bpProjectId,
    status: "running" as JobStatus,
    phase: "preparing" as JobPhase,
    progress: 0,
    outputPath: "",
    fileName: "",
    cancelRequested: false,
  } as ExportJob;
  const notifier = makeNotifier(job);
  job.changed = notifier.changed;
  job.notify = notifier.notify;
  jobs.set(id, job);

  try {
    const availability = ffmpegAvailable();
    if (!availability.available) throw new ApiError(500, availability.reason ?? "FFmpeg is unavailable", "ffmpeg-missing");

    const body = (await req.json()) as { project?: unknown; fileName?: string };
    if (!body?.project) throw new ApiError(400, "Missing project in request body", "missing-project");

    const project = deserializeProject(JSON.stringify(body.project));
    const paths = ensureProjectDirs(bpProjectId);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `${(body.fileName || project.name || "export").replace(/[^A-Za-z0-9._-]/g, "_")}-${stamp}.mp4`;
    const outputPath = resolveWithin(paths.exportsDir, fileName);
    job.fileName = fileName;
    job.outputPath = outputPath;

    // Not awaited — see this function's own doc comment for why. Any failure from here on (a bad
    // Khmer render, `buildExportPlan` rejecting the project, FFmpeg itself failing) lands on the JOB
    // (`status`/`error`, surfaced over SSE) rather than this response, which has already gone out by
    // the time any of it could happen.
    void runExportJob(job, project, paths, outputPath, req.url);

    return Response.json({ jobId: id, fileName, duration: sequenceDuration(project) });
  } catch (err) {
    jobs.delete(id);
    throw err;
  }
});

/** Does everything `POST` used to do inline before returning: the Khmer pre-pass, `buildExportPlan`,
 *  spawning FFmpeg, and every step of cleanup/bookkeeping after — now running in the background
 *  against the job `POST` already registered and responded with, updating `job.phase`/`job.message`
 *  as it goes so a client watching the SSE stream sees real, specific status the whole time instead
 *  of a silent gap before FFmpeg exists to report numeric progress. */
async function runExportJob(job: ExportJob, project: Project, paths: ProjectPaths, outputPath: string, reqUrl: string): Promise<void> {
  // One text clip's content, written to its own file so `drawtext`'s `textfile=` can read it (see
  // `ExportPlanOptions.textFilePathFor`'s own comment on why a file rather than an escaped `text=`
  // value) — ephemeral, this export's only, cleaned up in the `finally` below regardless of outcome.
  // A `wordHighlight` clip's generated `.ass` subtitle document (see `assFilePathFor` below) lives in
  // this same directory — same lifetime, same cleanup, no reason for a second temp dir.
  const textFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), "vcut-text-"));

  function fail(err: unknown): void {
    fs.rmSync(textFilesDir, { recursive: true, force: true });
    const code = typeof err === "object" && err && "code" in err ? (err as { code: string }).code : undefined;
    job.status = code === "cancelled" ? "cancelled" : "failed";
    if (job.status === "failed") job.error = err instanceof Error ? err.message : String(err);
    job.notify();
    setTimeout(() => jobs.delete(job.id), 60_000).unref?.();
  }

  // buildExportPlan throws ExportError for anything it can't render (empty timeline, offline media).
  // Surfacing that here means the user is told why BEFORE FFmpeg appears to start and then fails.
  let plan;
  try {
    // Khmer-script text clips render through a browser (headless Chromium via `khmerTextHarness.ts`),
    // pre-rendered to PNG windows here, BEFORE `buildExportPlan` runs — every FFmpeg-side text path
    // (`drawtext`, the libass `subtitles=` filter) fails to correctly stack certain Khmer subscript-
    // consonant clusters, confirmed empirically, so this pre-pass is what makes Khmer export correct
    // at all rather than falling back to the same broken `drawtext` path — see `khmerTextRenderer.ts`'s
    // own doc comment. `khmerTextWindowsFor` below is a SYNC callback `buildExportPlan` calls inline
    // per clip, so every window this export could possibly need must already be rendered by the time
    // it runs; gated the same way `buildExportPlan`'s own internal check is (no keyframed style, no
    // real crop) so a window is never computed for a clip that wouldn't use it anyway.
    const khmerClips = project.sequence.tracks
      .filter((track) => track.kind === "text")
      .flatMap((track) => track.clips)
      .filter((clip) => {
        const asset = project.assets.find((a) => a.id === clip.assetId);
        if (!asset?.textContent || !asset.textStyle) return false;
        if (hasTextStyleKeyframes(clip)) return false;
        if ((clip.textCrop && !isIdentityTextCrop(clip.textCrop)) || hasTextCropKeyframes(clip)) return false;
        return containsKhmerScript(asset.textContent);
      });

    const khmerWindowsByClipId = new Map<string, KhmerTextWindow[]>();
    if (khmerClips.length > 0) {
      job.phase = "rendering-text";
      job.message = "Preparing text overlays…";
      job.notify();
      if (job.cancelRequested) throw new ApiError(499, "Export cancelled", "cancelled");

      const baseUrl = new URL(reqUrl).origin;
      const customFontUrls = buildCustomFontDataUrls(paths.customFontsDir, project.customFonts);
      const harness = await openKhmerTextHarness(baseUrl, textFilesDir, customFontUrls);
      try {
        let rendered = 0;
        for (const clip of khmerClips) {
          if (job.cancelRequested) throw new ApiError(499, "Export cancelled", "cancelled");
          const asset = project.assets.find((a) => a.id === clip.assetId)!;
          const windows = await renderKhmerClipWindows(clip, asset.textContent!, asset.textStyle!, {
            frameWidth: project.sequence.width,
            frameHeight: project.sequence.height,
            fps: project.sequence.fps,
            customFonts: project.customFonts,
            renderFrame: harness.renderFrame,
          });
          khmerWindowsByClipId.set(clip.id, windows);
          rendered++;
          // "Text overlay" (singular per clip), not "window" — a viewer has no reason to know one
          // text clip can expand into several rendered images (per-word reveals, keyframed style
          // slices); "clip 2 of 3" maps onto what they actually placed on the timeline.
          job.message = `Rendering text overlay ${rendered} of ${khmerClips.length}…`;
          job.notify();
        }
      } finally {
        await harness.close();
      }
    }

    if (job.cancelRequested) throw new ApiError(499, "Export cancelled", "cancelled");
    job.phase = "preparing";
    job.message = "Preparing to render…";
    job.notify();

    plan = buildExportPlan(project, {
      inputPathFor: (assetId) => {
        const asset = project.assets.find((a) => a.id === assetId);
        if (!asset) throw new ApiError(400, "A clip references media that is no longer in the project", "missing-asset");
        return resolveWithin(paths.mediaDir, asset.relPath);
      },
      outputPath,
      fontPathFor: (fileName) => textFontPath(fileName),
      textFilePathFor: (clip, content, variant) => {
        const filePath = path.join(textFilesDir, `${clip.id}${variant ? `-${variant}` : ""}.txt`);
        fs.writeFileSync(filePath, content, "utf8");
        return filePath;
      },
      assFilePathFor: (clip, assContent) => {
        const filePath = path.join(textFilesDir, `${clip.id}.ass`);
        fs.writeFileSync(filePath, assContent, "utf8");
        return filePath;
      },
      fontMetricsFor,
      fontsDirFor: fontsDirPath,
      khmerTextWindowsFor: (clip: Clip) => khmerWindowsByClipId.get(clip.id),
    });
  } catch (err) {
    fail(err);
    return;
  }

  if (job.cancelRequested) {
    fail(new ApiError(499, "Export cancelled", "cancelled"));
    return;
  }

  job.phase = "encoding";
  job.message = undefined;
  job.notify();

  const run = runFfmpeg(plan.args, plan.duration, (fraction) => {
    job.progress = fraction;
    job.notify();
  });
  job.process = run.process;

  run.done
    .then(() => {
      job.status = "done";
      job.progress = 1;
    })
    .catch((err: unknown) => {
      const code = typeof err === "object" && err && "code" in err ? (err as { code: string }).code : undefined;
      job.status = code === "cancelled" ? "cancelled" : "failed";
      if (job.status === "failed") job.error = err instanceof Error ? err.message : String(err);
    })
    .finally(() => {
      job.notify();
      // FFmpeg is done reading them one way or another by the time `run.done` settles — safe to
      // remove regardless of whether the export succeeded, failed, or was cancelled.
      fs.rmSync(textFilesDir, { recursive: true, force: true });
      // Kept around briefly after finishing so a client that reconnects still learns the outcome,
      // then dropped so a long session doesn't accumulate dead jobs.
      setTimeout(() => jobs.delete(job.id), 60_000).unref?.();
    });
}

/** Looks up the currently-running job for a project, if any — `{ jobId: null }` when nothing's
 *  running. Exists so a fresh `ExportDialog` (a reloaded page, a second tab, or one that just lost
 *  its own `jobIdRef` some other way) can find and either resume watching or cancel an export that's
 *  already in flight for this project, instead of only being able to hit the 409 concurrency guard
 *  on `POST` with no way to act on it. Confirmed as a real, reported gap: hitting that 409 with a
 *  page that had never seen the job start left no way to manage it — including cancelling it — short
 *  of restarting the whole dev server. */
export const GET = localRoute(async (req) => {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  const lookupProjectId = url.searchParams.get("projectId");

  if (!jobId && lookupProjectId) {
    const running = [...jobs.values()].find((j) => j.bpProjectId === lookupProjectId && j.status === "running");
    return Response.json({ jobId: running?.id ?? null });
  }

  if (!jobId) throw new ApiError(400, "Missing jobId or projectId", "missing-job-id");
  const job = jobs.get(jobId);
  if (!job) throw new ApiError(404, "That export is no longer running", "job-missing");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = () => {
        const payload = {
          status: job.status,
          phase: job.phase,
          progress: job.progress,
          fileName: job.fileName,
          ...(job.message ? { message: job.message } : null),
          ...(job.error ? { error: job.error } : null),
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send();
      while (job.status === "running") {
        await job.changed;
        send();
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      // Without this a proxy may buffer the whole stream and deliver progress only at the end.
      "X-Accel-Buffering": "no",
    },
  });
});

/** Cancels a running export. If FFmpeg has already started, kills it directly — the process must
 *  actually stop, not just stop being watched, or it would keep burning CPU and writing to the
 *  output file. Earlier than that (still in the Khmer pre-pass — `job.process` doesn't exist yet),
 *  there's no process to kill; `cancelRequested` is checked between each `await` in `runExportJob`
 *  instead, so the job still winds down at the next opportunity rather than running the whole
 *  pre-pass to completion unstoppably just because a cancel arrived before FFmpeg did. */
export const DELETE = localRoute(async (req) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new ApiError(400, "Missing jobId", "missing-job-id");
  const job = jobs.get(jobId);
  if (!job) throw new ApiError(404, "That export is no longer running", "job-missing");

  if (job.status === "running") {
    job.cancelRequested = true;
    if (job.process) job.process.kill("SIGKILL");
  }
  return Response.json({ ok: true });
});

/** Reports whether export is possible at all, so the UI can explain a missing FFmpeg instead of
 *  offering a button that would fail. Finished files are served by the media/raw route with
 *  `kind=export`. */
export const HEAD = localRoute(async () => {
  const availability = ffmpegAvailable();
  return new Response(null, { status: availability.available ? 204 : 503 });
});
