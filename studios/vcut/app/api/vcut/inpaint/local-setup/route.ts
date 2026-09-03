import { getLocalSetupStatus, runLocalSetup, type LocalSetupJob, type LocalSetupJobStatus, type LocalSetupStage } from "../../_lib/localModel";
import { localRoute } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same module-lifetime in-memory job map as `inpaint/route.ts` and `export/route.ts` — a separate map,
 *  not shared with either, matching those two routes' own "each owns its own map" precedent. */
const jobs = new Map<string, LocalSetupJob>();

function makeNotifier(job: Partial<LocalSetupJob>): { changed: Promise<void>; notify: () => void } {
  let resolve!: () => void;
  const changed = new Promise<void>((r) => (resolve = r));
  return {
    changed,
    notify: () => {
      resolve();
      const next = makeNotifier(job);
      (job as LocalSetupJob).changed = next.changed;
      (job as LocalSetupJob).notify = next.notify;
    },
  };
}

/** Whether the local ProPainter runtime is set up — the Inspector's "Remove Object" section calls this
 *  to decide between showing the "Set up local model" button and the normal ready-to-use flow. */
export const GET = localRoute(async (req) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) return Response.json(getLocalSetupStatus());

  const job = jobs.get(jobId);
  if (!job) throw new ApiError(404, "That setup job is no longer running", "job-missing");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = () => {
        const payload: { status: LocalSetupJobStatus; stage: LocalSetupStage; progress: number; error?: string } = {
          status: job.status,
          stage: job.stage,
          progress: job.progress,
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
      "X-Accel-Buffering": "no",
    },
  });
});

/** Starts provisioning the local Python runtime (clone + venv + pip install) — long-running (several
 *  minutes, network + disk heavy), so this returns immediately with a job id and the real work runs
 *  async, same fire-and-track-via-SSE shape as `inpaint/route.ts`'s own POST. */
export const POST = localRoute(async () => {
  const id = crypto.randomUUID();
  const job = {
    id,
    status: "running" as LocalSetupJobStatus,
    stage: "cloning" as LocalSetupStage,
    progress: 0,
    currentProcess: null,
    abortController: new AbortController(),
  } as LocalSetupJob;
  const notifier = makeNotifier(job);
  job.changed = notifier.changed;
  job.notify = notifier.notify;
  jobs.set(id, job);

  void runLocalSetup(job).finally(() => {
    setTimeout(() => jobs.delete(id), 60_000).unref?.();
  });

  return Response.json({ jobId: id });
});

/** Cancels a running setup job — kills whichever `git`/`pip` child process is currently active. */
export const DELETE = localRoute(async (req) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new ApiError(400, "Missing jobId", "missing-job-id");
  const job = jobs.get(jobId);
  if (!job) throw new ApiError(404, "That setup job is no longer running", "job-missing");

  if (job.status === "running") {
    job.currentProcess?.kill("SIGKILL");
    job.abortController.abort();
  }
  return Response.json({ ok: true });
});
