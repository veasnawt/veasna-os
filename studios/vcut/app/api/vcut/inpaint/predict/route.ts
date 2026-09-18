import Replicate from "replicate";
import { getReplicateToken } from "../../_lib/inpaintEnvFile";
import { corsPreflight, hostedCreditGatedRouteCors, hostedSessionRouteCors } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Real per-second/flat costs — see `inpaint/route.ts`'s own `REMOVE_OBJECT_CREDITS_PER_SECOND`/
 *  `REMOVE_OBJECT_FLAT_COST` doc comments for the full pricing derivation (kept in sync by hand, same
 *  "duplicated across client/server, change both together" tradeoff every other credit constant here
 *  already accepts). */
const REMOVE_OBJECT_CREDITS_PER_SECOND = 16;
const REMOVE_OBJECT_FLAT_COST = 12;

/** Desktop's own local server calls this ONCE PER CHUNK (a clip over `bria/video-erase-object`'s 5s
 *  cap runs several chunks — see `inpaint/route.ts`'s own `runChunkedInpaintPrediction`) or once for a
 *  short clip/still image. Everything that can only run on the machine with the real project files —
 *  reading the project, extracting the clip, drawing the region mask, chunking a long clip, stitching
 *  chunk results back together — stays there, completely unchanged; this route is ONLY the part that
 *  needs the secret Replicate token: given an already-locally-prepared video/image + mask, run the
 *  actual cloud erase and hand the result back.
 *
 *  Only "replicate" is offered here — "fal.ai" was a second cloud vendor a desktop user could pick if
 *  they'd supplied their own fal key; now that self-supplied keys are retired in favor of one shared,
 *  centrally-funded credits system (same reasoning as Stock/Stickers/AI's own retirement of local keys
 *  — see `useHostedCreditsGate.ts`'s own doc comment), there's no reason to fund two redundant cloud
 *  vendors from the same pool. `inpaint/route.ts`'s local server silently treats a saved `"fal"`
 *  preference (from before this change) the same as `"replicate"` when calling this route, rather than
 *  leaving it pointed at a dead code path — see that file's own comment. The fully-local CPU option
 *  (ProPainter) is untouched by any of this: it needs no key, no credits, and never reaches this route
 *  at all.
 *
 *  Always uploads the raw bytes directly to Replicate via the SDK's own `File` handling (never the
 *  old route's `HOSTED_ORIGIN` scratch-file-URL trick) — that trick existed so Bria's OWN servers could
 *  fetch a file back off vcut.io's public URL instead of a private Replicate upload; it's irrelevant
 *  here since the bytes already arrived over HTTP and just need uploading once, the same way desktop's
 *  own local/non-hosted mode always did successfully before this change. */
export const POST = hostedCreditGatedRouteCors("remove-object", REMOVE_OBJECT_FLAT_COST, async (req, _user, spend) => {
  const token = getReplicateToken();
  if (!token) throw new ApiError(500, "Remove Object isn't configured on this server", "inpaint-not-configured");

  const body = (await req.json().catch(() => null)) as {
    kind?: "video" | "image";
    videoBase64?: string;
    imageBase64?: string;
    maskBase64?: string;
    costSeconds?: number;
  } | null;
  const kind = body?.kind === "image" ? "image" : "video";
  const primaryBase64 = kind === "image" ? body?.imageBase64 : body?.videoBase64;
  const maskBase64 = body?.maskBase64;
  if (!primaryBase64 || !maskBase64) throw new ApiError(400, "Missing video/image or mask", "missing-media");

  const cost =
    kind === "image"
      ? REMOVE_OBJECT_FLAT_COST
      : Math.max(1, Math.ceil((typeof body?.costSeconds === "number" ? body.costSeconds : 1) * REMOVE_OBJECT_CREDITS_PER_SECOND));
  await spend(cost);

  try {
    const replicate = new Replicate({ auth: token });
    const primaryBytes = Buffer.from(primaryBase64, "base64");
    const maskBytes = Buffer.from(maskBase64, "base64");

    if (kind === "image") {
      const model = await replicate.models.get("bria", "eraser");
      const version = model.latest_version?.id;
      if (!version) throw new ApiError(502, "Replicate's image object-removal model has no runnable version", "replicate-model-unavailable");
      const input = {
        image: new File([primaryBytes], "src.png", { type: "image/png" }),
        mask: new File([maskBytes], "mask.png", { type: "image/png" }),
      };
      const result = await replicate.run(`bria/eraser:${version}`, { input, signal: req.signal });
      const output = Array.isArray(result) ? result[0] : result;
      if (output && typeof (output as { blob?: unknown }).blob === "function") {
        const blob = await (output as { blob: () => Promise<Blob> }).blob();
        return Response.json({ resultBase64: Buffer.from(await blob.arrayBuffer()).toString("base64") });
      }
      if (typeof output === "string") {
        const res = await fetch(output, { signal: req.signal });
        if (!res.ok) throw new ApiError(502, `Downloading the Replicate result failed (${res.status})`, "download-failed");
        return Response.json({ resultBase64: Buffer.from(await res.arrayBuffer()).toString("base64") });
      }
      throw new ApiError(502, "Replicate's prediction had no usable output image", "replicate-predict-failed");
    }

    const model = await replicate.models.get("bria", "video-erase-object");
    const version = model.latest_version?.id;
    if (!version) throw new ApiError(502, "Replicate's video object-removal model has no runnable version", "replicate-model-unavailable");
    const input = {
      video_url: new File([primaryBytes], "src.mp4", { type: "video/mp4" }),
      mask_url: new File([maskBytes], "mask.mp4", { type: "video/mp4" }),
      auto_trim: true,
    };
    const result = await replicate.run(`bria/video-erase-object:${version}`, { input, signal: req.signal });
    const output = Array.isArray(result) ? result[0] : result;
    if (!output || typeof (output as { blob?: unknown }).blob !== "function") {
      throw new ApiError(502, "Replicate's prediction had no usable output video", "replicate-predict-failed");
    }
    const blob = await (output as { blob: () => Promise<Blob> }).blob();
    return Response.json({ resultBase64: Buffer.from(await blob.arrayBuffer()).toString("base64") });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const isAbort = err instanceof Error && err.name === "AbortError";
    if (isAbort) throw new ApiError(499, "Cancelled", "cancelled");
    console.error("[vcut] inpaint/predict: prediction failed:", err);
    throw new ApiError(502, "Remove Object is temporarily unavailable — please try again later.", "inpaint-predict-failed");
  }
});

/** Reports whether the REMOTE half (secret Replicate token) is configured — `client.ts`'s
 *  `inpaintAvailable()` combines this with `inpaint/route.ts`'s own local FFmpeg/local-model check. */
export const HEAD = hostedSessionRouteCors(async () => {
  return new Response(null, { status: getReplicateToken() ? 204 : 503 });
});

export const OPTIONS = corsPreflight;
