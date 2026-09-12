import Replicate from "replicate";
import { refundCredits } from "../_lib/credits";
import { getReplicateTokenForGeneration } from "../_lib/externalMediaEnv";
import { importMediaBytes } from "../_lib/importMedia";
import { hostedCreditGatedRoute, hostedSessionRoute } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs } from "../_lib/paths";
import { extractReplicateMediaBytes } from "../_lib/replicateOutput";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `minimax/video-01` generates up to 6 seconds of 720p/25fps video per run, with no user-configurable
 *  duration (unlike Remove Object's own per-second Replicate billing) — so a flat per-generation cost
 *  is the right SHAPE here, not a per-second rate.
 *
 *  The exact number is an ESTIMATE, not directly confirmed the way `AI_IMAGE_CREDITS_PER_GENERATION`'s
 *  own $0.003/megapixel figure was (Replicate's own pricing page didn't surface a number for this
 *  specific model when checked, and this sandbox's own outbound network is Cloudflare-blocked from
 *  reaching replicate.com's API directly to confirm it empirically either) — derived instead from the
 *  same underlying MiniMax model's confirmed fal.ai price for real speech ($0.045/sec × 6s = $0.27),
 *  since Replicate and fal.ai both resell the same third-party model and typically land close to its
 *  real vendor cost. At this app's own ~60% gross-margin target (~$0.00333 of real cost per credit,
 *  same math `AI_IMAGE_CREDITS_PER_GENERATION`'s own comment walks through), $0.27 ÷ $0.00333 ≈ 81
 *  credits. TODO once real production jobs have run: reconcile this against the actual Replicate
 *  invoice and correct this ONE constant if it's meaningfully off, the same "verify against real
 *  evidence, not just docs" pass `captions/route.ts`'s own pause-detection history went through. */
const AI_VIDEO_CREDITS_PER_GENERATION = 81;

const MINIMAX_VIDEO_MODEL = "minimax/video-01";

type Stage = "predicting" | "downloading" | "importing";
type JobStatus = "running" | "done" | "failed" | "cancelled";

interface AiVideoJob {
  id: string;
  status: JobStatus;
  stage: Stage;
  progress: number;
  asset?: import("@veasnawt/vcut/src/project/types").Asset;
  error?: string;
  ownerId?: string;
  spentAmount: number;
  abortController: AbortController;
  changed: Promise<void>;
  notify: () => void;
}

/** Same module-lifetime in-memory job map every other async feature here uses (`inpaint/route.ts`,
 *  `captions/route.ts`, `export/route.ts`) — see any of their own comments for why that scope is right
 *  for a local, single-user-per-request editor. */
const jobs = new Map<string, AiVideoJob>();

function assertJobOwnership(job: AiVideoJob, userId: string | null): void {
  if (job.ownerId !== undefined && job.ownerId !== userId) throw new ApiError(404, "That job is no longer running", "job-missing");
}

function makeNotifier(job: Partial<AiVideoJob>): { changed: Promise<void>; notify: () => void } {
  let resolve!: () => void;
  const changed = new Promise<void>((r) => (resolve = r));
  return {
    changed,
    notify: () => {
      resolve();
      const next = makeNotifier(job);
      (job as AiVideoJob).changed = next.changed;
      (job as AiVideoJob).notify = next.notify;
    },
  };
}

const STAGE_RANGES: Record<Stage, [number, number]> = {
  predicting: [0, 0.85],
  downloading: [0.85, 0.95],
  importing: [0.95, 1],
};

function setStageProgress(job: AiVideoJob, stage: Stage, fraction: number) {
  const [start, end] = STAGE_RANGES[stage];
  job.stage = stage;
  job.progress = start + (end - start) * Math.min(1, Math.max(0, fraction));
  job.notify();
}

async function runAiVideoJob(job: AiVideoJob, bpProjectId: string, prompt: string, ownerId: string | undefined) {
  const paths = ensureProjectDirs(bpProjectId);
  try {
    const token = getReplicateTokenForGeneration();
    if (!token) throw new ApiError(500, "AI video generation isn't configured on this server", "ai-video-not-configured");

    setStageProgress(job, "predicting", 0);
    const replicate = new Replicate({ auth: token });
    const output = await replicate.run(
      MINIMAX_VIDEO_MODEL,
      { input: { prompt }, signal: job.abortController.signal },
      (prediction) => {
        setStageProgress(job, "predicting", prediction.status === "succeeded" ? 1 : prediction.status === "processing" ? 0.6 : 0.1);
      }
    );

    setStageProgress(job, "downloading", 0);
    const bytes = await extractReplicateMediaBytes(output, "The video generator returned no usable output", "ai-video-no-output");
    setStageProgress(job, "downloading", 1);

    setStageProgress(job, "importing", 0);
    const asset = await importMediaBytes(paths, bytes, `${prompt.slice(0, 40).replace(/[^a-zA-Z0-9-]+/g, "-") || "ai-video"}.mp4`);
    setStageProgress(job, "importing", 1);

    job.asset = asset;
    job.status = "done";
    job.progress = 1;
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    job.status = isAbort ? "cancelled" : "failed";
    if (job.status === "failed") {
      job.error = err instanceof ApiError ? err.message : "AI video generation is temporarily unavailable — please try again later.";
      if (!(err instanceof ApiError)) console.error("[vcut] ai-video: job failed:", err);
      // Same "cancellation never refunds, a real failure always does" split `captions/route.ts`'s own
      // catch block documents — a user-initiated cancel mid-flight may already have incurred real
      // provider-side cost.
      if (ownerId) void refundCredits(ownerId, job.spentAmount);
    }
  } finally {
    job.notify();
    setTimeout(() => jobs.delete(job.id), 60_000).unref?.();
  }
}

export const POST = hostedCreditGatedRoute("ai-video", AI_VIDEO_CREDITS_PER_GENERATION, async (req, user, spend) => {
  const bpProjectId = new URL(req.url).searchParams.get("projectId");
  if (!bpProjectId) throw new ApiError(400, "Missing projectId", "missing-project-id");

  const body = (await req.json().catch(() => null)) as { prompt?: string } | null;
  const prompt = body?.prompt?.trim();
  if (!prompt) throw new ApiError(400, "Enter a prompt first", "missing-prompt");

  if (!getReplicateTokenForGeneration()) throw new ApiError(500, "AI video generation isn't configured on this server", "ai-video-not-configured");

  await spend();

  const id = crypto.randomUUID();
  const job = {
    id,
    status: "running" as JobStatus,
    stage: "predicting" as Stage,
    progress: 0,
    spentAmount: AI_VIDEO_CREDITS_PER_GENERATION,
    abortController: new AbortController(),
    ...(user ? { ownerId: user.id } : null),
  } as AiVideoJob;
  const notifier = makeNotifier(job);
  job.changed = notifier.changed;
  job.notify = notifier.notify;
  jobs.set(id, job);

  void runAiVideoJob(job, bpProjectId, prompt, user?.id).catch(() => {
    // `runAiVideoJob` already handles its own errors internally — this only guarantees an unexpected
    // throw inside it can never become an unhandled rejection.
  });

  return Response.json({ jobId: id });
});

export const GET = hostedSessionRoute(async (req, user) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new ApiError(400, "Missing jobId", "missing-job-id");
  const job = jobs.get(jobId);
  if (!job) throw new ApiError(404, "That job is no longer running", "job-missing");
  assertJobOwnership(job, user?.id ?? null);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = () => {
        const payload = {
          status: job.status,
          stage: job.stage,
          progress: job.progress,
          ...(job.error ? { error: job.error } : null),
          ...(job.asset ? { asset: job.asset } : null),
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
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
});

export const DELETE = hostedSessionRoute(async (req, user) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new ApiError(400, "Missing jobId", "missing-job-id");
  const job = jobs.get(jobId);
  if (!job) throw new ApiError(404, "That job is no longer running", "job-missing");
  assertJobOwnership(job, user?.id ?? null);

  if (job.status === "running") job.abortController.abort();
  return Response.json({ ok: true });
});

export const HEAD = hostedSessionRoute(async () => {
  return new Response(null, { status: getReplicateTokenForGeneration() ? 204 : 503 });
});
