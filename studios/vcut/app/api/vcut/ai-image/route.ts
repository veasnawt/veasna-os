import Replicate from "replicate";
import { refundCredits } from "../_lib/credits";
import { getReplicateTokenForGeneration } from "../_lib/externalMediaEnv";
import { importMediaBytes } from "../_lib/importMedia";
import { hostedCreditGatedRoute, hostedSessionRoute } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs } from "../_lib/paths";
import { extractReplicateMediaBytes } from "../_lib/replicateOutput";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A first production run of this route (back when it ran Flux Schnell) came back with
 *  `ai-image-no-output` — `output` itself was literally `null`, not just an unrecognized shape
 *  (confirmed via `extractReplicateMediaBytes`'s own diagnostic logging). The likely cause: this route
 *  called `replicate.run()` with the bare `"owner/name"` shorthand for an OFFICIAL model, which
 *  resolves through a different Replicate API path (predictions keyed by `model`, not `version`) than
 *  the explicit `owner/name:version` form — `inpaint/route.ts`'s own proven-working call NEVER uses the
 *  bare shorthand, always resolving `models.get()` → `latest_version.id` first, for exactly this reason
 *  (see its own comment). Every model below resolves its version explicitly for the same reason. */

/** Every aspect ratio this route offers matches one of `RESOLUTION_PRESETS` (`project/types.ts`)
 *  exactly — a user generating an image for THIS project almost always wants it to already fit the
 *  project's own frame shape, so the client defaults to whichever of these matches the current
 *  sequence rather than making that a second decision on top of the prompt itself. Confirmed (not
 *  assumed) that all three models below accept all three of these via each one's own README. */
const ASPECT_RATIOS = ["9:16", "16:9", "1:1"] as const;
type AspectRatio = (typeof ASPECT_RATIOS)[number];

type ModelId = "flare" | "sunburst" | "nano-banana-2";
const MODEL_IDS: ModelId[] = ["flare", "sunburst", "nano-banana-2"];

interface ModelConfig {
  owner: string;
  name: string;
  /** Real per-image cost each is billed at, confirmed against each provider's own published rate
   *  (OpenAI's own token-based price table for the two GPT-Image-2.5 snapshots — Replicate itself
   *  publishes no separate number for either — and Google's own resolution-tiered rate for Nano
   *  Banana 2), at this app's own ~60% gross-margin target: real cost ÷ ~$0.00333-per-credit budget,
   *  rounded up (same math `REMOVE_OBJECT_CREDITS_PER_SECOND`'s own comment walks through). */
  credits: number;
  buildInput: (prompt: string, aspectRatio: AspectRatio) => Record<string, unknown>;
}

const MODELS: Record<ModelId, ModelConfig> = {
  // $0.0132/image at "medium" quality (OpenAI's own per-image rate at 1024×1024) ÷ ~$0.00333/credit ≈
  // 3.96 → 4 credits. The default: cheap and fast enough for an everyday first draft.
  flare: {
    owner: "openai",
    name: "gpt-image-2.5-flare",
    credits: 4,
    buildInput: (prompt, aspectRatio) => ({ prompt, aspect_ratio: aspectRatio, quality: "medium", output_format: "png" }),
  },
  // $0.0527/image at "high" quality ÷ ~$0.00333/credit ≈ 15.8 → 16 credits. The premium option — a
  // real step up in both cost and (per OpenAI's own positioning) fidelity over Flare.
  sunburst: {
    owner: "openai",
    name: "gpt-image-2.5-sunburst",
    credits: 16,
    buildInput: (prompt, aspectRatio) => ({ prompt, aspect_ratio: aspectRatio, quality: "high", output_format: "png" }),
  },
  // $0.067/image at "1K" resolution (Google's own rate) ÷ ~$0.00333/credit ≈ 20.1 → 21 credits.
  // `resolution`/`output_format` field NAMES themselves are this route's one remaining unconfirmed
  // guess — Nano Banana 2's own README documents the VALUES ("512px, 1K, 2K, 4K" / "jpg, png") but not
  // the exact field names as of writing, and this sandbox can't reach Replicate directly to confirm
  // them empirically the way Flux Schnell's own output-shape bug got confirmed after the fact.
  // `extractReplicateMediaBytes`'s own diagnostic logging (and the refund-on-failure path below) is
  // what a wrong guess here surfaces — same "verify against real evidence once live" recovery this
  // route's own Flux Schnell history already went through once.
  "nano-banana-2": {
    owner: "google",
    name: "nano-banana-2",
    credits: 21,
    buildInput: (prompt, aspectRatio) => ({ prompt, aspect_ratio: aspectRatio, resolution: "1K", output_format: "png" }),
  },
};

const DEFAULT_MODEL: ModelId = "flare";

/** `POST /api/vcut/ai-image?projectId=...` `{prompt, aspectRatio, model}` — synchronous, unlike Remove
 *  Object/Auto Captions' own job+SSE pattern: every model here typically finishes in low single-digit
 *  seconds, so holding one HTTP request open for the whole thing is simpler than a job map/polling loop
 *  for a real latency this short. AI VIDEO generation (`ai-video/route.ts`) is the opposite case — that
 *  one takes minutes, and uses the job/SSE pattern for exactly the reason this route doesn't need it. */
export const POST = hostedCreditGatedRoute("ai-image", MODELS[DEFAULT_MODEL].credits, async (req, user, spend) => {
  const bpProjectId = new URL(req.url).searchParams.get("projectId");
  if (!bpProjectId) throw new ApiError(400, "Missing projectId", "missing-project-id");
  const paths = ensureProjectDirs(bpProjectId);

  const body = (await req.json().catch(() => null)) as { prompt?: string; aspectRatio?: string; model?: string } | null;
  const prompt = body?.prompt?.trim();
  if (!prompt) throw new ApiError(400, "Enter a prompt first", "missing-prompt");
  const aspectRatio: AspectRatio = ASPECT_RATIOS.includes(body?.aspectRatio as AspectRatio) ? (body!.aspectRatio as AspectRatio) : "9:16";
  const modelId: ModelId = MODEL_IDS.includes(body?.model as ModelId) ? (body!.model as ModelId) : DEFAULT_MODEL;
  const modelConfig = MODELS[modelId];

  const token = getReplicateTokenForGeneration();
  if (!token) throw new ApiError(500, "AI image generation isn't configured on this server", "ai-image-not-configured");

  // Every upfront check above has passed — this is genuinely about to do real, billable work, same
  // "spend right before starting, not before validating" convention every other credit-gated route
  // here already follows. `spend(modelConfig.credits)`, not a bare `spend()`: the route's own DECLARED
  // cost (`MODELS[DEFAULT_MODEL].credits`, used only for `hostedCreditGatedRoute`'s registration) is
  // just Flare's price — Sunburst/Nano Banana 2 both cost more, so the actual charge has to come from
  // whichever model was really selected, not that fixed default.
  await spend(modelConfig.credits);

  // Anything past this point that fails means the user paid for a generation that produced nothing —
  // refunded in `catch`, same "spend before, refund on failure" contract every other credit-gated
  // route here follows (see `captions/route.ts`'s own identical reasoning).
  try {
    const replicate = new Replicate({ auth: token });
    const model = await replicate.models.get(modelConfig.owner, modelConfig.name);
    const version = model.latest_version?.id;
    if (!version) throw new ApiError(502, `${modelConfig.name} has no runnable version on Replicate`, "replicate-model-unavailable");

    const output = await replicate.run(`${modelConfig.owner}/${modelConfig.name}:${version}`, {
      input: modelConfig.buildInput(prompt, aspectRatio),
      signal: req.signal,
    });

    const bytes = await extractReplicateMediaBytes(output, "The image generator returned no usable output", "ai-image-no-output");

    const asset = await importMediaBytes(paths, bytes, `${prompt.slice(0, 40).replace(/[^a-zA-Z0-9-]+/g, "-") || "ai-image"}.png`);
    return Response.json({ asset });
  } catch (err) {
    if (user) void refundCredits(user.id, modelConfig.credits);
    if (err instanceof ApiError) throw err;
    console.error("[vcut] ai-image: generation failed:", err);
    throw new ApiError(502, err instanceof Error ? err.message : "The image generator failed", "ai-image-generate-failed");
  }
});

/** Reports whether AI image generation is usable right now — same "capability, not credits" split
 *  every other feature's own `HEAD` already draws (a 0-credit user still gets 204 here). */
export const HEAD = hostedSessionRoute(async () => {
  return new Response(null, { status: getReplicateTokenForGeneration() ? 204 : 503 });
});
