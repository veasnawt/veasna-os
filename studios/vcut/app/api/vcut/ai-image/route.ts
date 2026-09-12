import Replicate from "replicate";
import { refundCredits } from "../_lib/credits";
import { getReplicateTokenForGeneration } from "../_lib/externalMediaEnv";
import { importMediaBytes } from "../_lib/importMedia";
import { hostedCreditGatedRoute, hostedSessionRoute } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs } from "../_lib/paths";
import { extractReplicateMediaBytes } from "../_lib/replicateOutput";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Flux Schnell bills Replicate usage at $0.003/megapixel (confirmed directly against Replicate's own
 *  pricing page, not assumed) — a standard ≤1-megapixel generation (every `aspect_ratio` this route
 *  offers is comfortably under that) costs right around $0.003 per image.
 *
 *  1 credit, not a fractional/rounded-up rate: VCut Pro's own credit-to-dollar rate is $9.99 ÷ 1200 =
 *  $0.008325/credit, and this route's own ~60% gross margin target (same target `REMOVE_OBJECT_
 *  CREDITS_PER_SECOND`'s own comment documents) means the real cost this should cover is capped at
 *  ~40% of that, i.e. ~$0.00333/credit — a $0.003 real cost fits inside ONE credit's own budget
 *  almost exactly, with no meaningful under-pricing to correct for the way a sub-credit real cost
 *  would need rounding up for. Unlike Remove Object's own per-second rate, this genuinely IS a flat
 *  per-generation cost (Flux Schnell has no per-second dimension at all), so a flat constant is the
 *  correct shape here, not an approximation of one. */
const AI_IMAGE_CREDITS_PER_GENERATION = 1;

const FLUX_SCHNELL_MODEL = "black-forest-labs/flux-schnell";

/** A first production run of this route came back with `ai-image-no-output` — proof that Replicate's
 *  real output shape for this model doesn't match the single `FileOutput`-with-`.blob()` shape
 *  `inpaint/route.ts`'s own working pattern uses (this sandbox's own outbound network can't reach
 *  replicate.com to have confirmed the real shape before shipping — see this route's own credit-cost
 *  comment). `extractReplicateMediaBytes` (shared with `ai-video/route.ts`, which has the same
 *  uncertainty) tries several real shapes instead of assuming just one. */

/** Every aspect ratio this route offers matches one of `RESOLUTION_PRESETS` (`project/types.ts`)
 *  exactly — a user generating an image for THIS project almost always wants it to already fit the
 *  project's own frame shape, so the client defaults to whichever of these matches the current
 *  sequence rather than making that a second decision on top of the prompt itself. */
const ASPECT_RATIOS = ["9:16", "16:9", "1:1"] as const;
type AspectRatio = (typeof ASPECT_RATIOS)[number];

/** `POST /api/vcut/ai-image?projectId=...` `{prompt, aspectRatio}` — synchronous, unlike Remove
 *  Object/Auto Captions' own job+SSE pattern: Flux Schnell is genuinely fast (its own name — a single
 *  generation typically finishes in low single-digit seconds), so holding one HTTP request open for
 *  the whole thing is simpler than a job map/polling loop for a real latency this short. AI VIDEO
 *  generation (`ai-video/route.ts`) is the opposite case — that one takes minutes, and uses the job/
 *  SSE pattern for exactly the reason this route doesn't need it. */
export const POST = hostedCreditGatedRoute("ai-image", AI_IMAGE_CREDITS_PER_GENERATION, async (req, user, spend) => {
  const bpProjectId = new URL(req.url).searchParams.get("projectId");
  if (!bpProjectId) throw new ApiError(400, "Missing projectId", "missing-project-id");
  const paths = ensureProjectDirs(bpProjectId);

  const body = (await req.json().catch(() => null)) as { prompt?: string; aspectRatio?: string } | null;
  const prompt = body?.prompt?.trim();
  if (!prompt) throw new ApiError(400, "Enter a prompt first", "missing-prompt");
  const aspectRatio: AspectRatio = ASPECT_RATIOS.includes(body?.aspectRatio as AspectRatio) ? (body!.aspectRatio as AspectRatio) : "9:16";

  const token = getReplicateTokenForGeneration();
  if (!token) throw new ApiError(500, "AI image generation isn't configured on this server", "ai-image-not-configured");

  // Every upfront check above has passed — this is genuinely about to do real, billable work, same
  // "spend right before starting, not before validating" convention every other credit-gated route
  // here already follows.
  await spend();

  // Anything past this point that fails means the user paid for a generation that produced nothing —
  // refunded in `catch`, same "spend before, refund on failure" contract every other credit-gated
  // route here follows (see `captions/route.ts`'s own identical reasoning).
  try {
    const replicate = new Replicate({ auth: token });
    const output = await replicate.run(FLUX_SCHNELL_MODEL, {
      input: { prompt, aspect_ratio: aspectRatio, num_outputs: 1, output_format: "png" },
      signal: req.signal,
    });

    const bytes = await extractReplicateMediaBytes(output, "The image generator returned no usable output", "ai-image-no-output");

    const asset = await importMediaBytes(paths, bytes, `${prompt.slice(0, 40).replace(/[^a-zA-Z0-9-]+/g, "-") || "ai-image"}.png`);
    return Response.json({ asset });
  } catch (err) {
    if (user) void refundCredits(user.id, AI_IMAGE_CREDITS_PER_GENERATION);
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
