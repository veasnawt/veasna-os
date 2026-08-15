import type { ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { buildExportPlan } from "@veasna/vstudio/src/export/buildExportPlan";
import { deserializeProject } from "@veasna/vstudio/src/project/serialize";
import { ffmpegAvailable, runFfmpeg, textFontPath } from "../_lib/ffmpeg";
import { localRoute } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs, resolveWithin } from "../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JobStatus = "running" | "done" | "failed" | "cancelled";

interface ExportJob {
  id: string;
  status: JobStatus;
  progress: number;
  outputPath: string;
  fileName: string;
  error?: string;
  process: ChildProcess;
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

/** Starts an export and returns immediately with a job id. The render runs in a child process, so
 *  the UI thread and the server's event loop both stay responsive throughout. */
export const POST = localRoute(async (req) => {
  const url = new URL(req.url);
  const bpProjectId = url.searchParams.get("projectId");
  if (!bpProjectId) throw new ApiError(400, "Missing projectId", "missing-project-id");

  const availability = ffmpegAvailable();
  if (!availability.available) throw new ApiError(500, availability.reason ?? "FFmpeg is unavailable", "ffmpeg-missing");

  const body = (await req.json()) as { project?: unknown; fileName?: string };
  if (!body?.project) throw new ApiError(400, "Missing project in request body", "missing-project");

  const project = deserializeProject(JSON.stringify(body.project));
  const paths = ensureProjectDirs(bpProjectId);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `${(body.fileName || project.name || "export").replace(/[^A-Za-z0-9._-]/g, "_")}-${stamp}.mp4`;
  const outputPath = resolveWithin(paths.exportsDir, fileName);

  // One text clip's content, written to its own file so `drawtext`'s `textfile=` can read it (see
  // `ExportPlanOptions.textFilePathFor`'s own comment on why a file rather than an escaped `text=`
  // value) — ephemeral, this export's only, cleaned up in the `finally` below regardless of outcome.
  const textFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), "vstudio-text-"));

  // buildExportPlan throws ExportError for anything it can't render (empty timeline, offline media).
  // Surfacing that here means the user is told why BEFORE a job appears to start and then fails.
  let plan;
  try {
    plan = buildExportPlan(project, {
      inputPathFor: (assetId) => {
        const asset = project.assets.find((a) => a.id === assetId);
        if (!asset) throw new ApiError(400, "A clip references media that is no longer in the project", "missing-asset");
        return resolveWithin(paths.mediaDir, asset.relPath);
      },
      outputPath,
      fontPathFor: (fileName) => textFontPath(fileName),
      textFilePathFor: (clip, content) => {
        const filePath = path.join(textFilesDir, `${clip.id}.txt`);
        fs.writeFileSync(filePath, content, "utf8");
        return filePath;
      },
    });
  } catch (err) {
    fs.rmSync(textFilesDir, { recursive: true, force: true });
    throw err;
  }

  const id = crypto.randomUUID();
  const job = { id, status: "running" as JobStatus, progress: 0, outputPath, fileName } as ExportJob;
  const notifier = makeNotifier(job);
  job.changed = notifier.changed;
  job.notify = notifier.notify;

  const run = runFfmpeg(plan.args, plan.duration, (fraction) => {
    job.progress = fraction;
    job.notify();
  });
  job.process = run.process;
  jobs.set(id, job);

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
      setTimeout(() => jobs.delete(id), 60_000).unref?.();
    });

  return Response.json({ jobId: id, fileName, duration: plan.duration });
});

/** Streams progress as Server-Sent Events until the job reaches a terminal state. */
export const GET = localRoute(async (req) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new ApiError(400, "Missing jobId", "missing-job-id");
  const job = jobs.get(jobId);
  if (!job) throw new ApiError(404, "That export is no longer running", "job-missing");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = () => {
        const payload = {
          status: job.status,
          progress: job.progress,
          fileName: job.fileName,
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

/** Cancels a running export. Kills the FFmpeg child directly — the process must actually stop, not
 *  just stop being watched, or it would keep burning CPU and writing to the output file. */
export const DELETE = localRoute(async (req) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new ApiError(400, "Missing jobId", "missing-job-id");
  const job = jobs.get(jobId);
  if (!job) throw new ApiError(404, "That export is no longer running", "job-missing");

  if (job.status === "running") job.process.kill("SIGKILL");
  return Response.json({ ok: true });
});

/** Reports whether export is possible at all, so the UI can explain a missing FFmpeg instead of
 *  offering a button that would fail. Finished files are served by the media/raw route with
 *  `kind=export`. */
export const HEAD = localRoute(async () => {
  const availability = ffmpegAvailable();
  return new Response(null, { status: availability.available ? 204 : 503 });
});
