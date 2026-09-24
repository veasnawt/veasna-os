import fs from "fs";
import os from "os";
import path from "path";
import Replicate from "replicate";
import { refundCredits } from "../../_lib/credits";
import { probeMedia } from "../../_lib/ffmpeg";
import { getReplicateToken } from "../../_lib/inpaintEnvFile";
import { corsPreflight, hostedCreditGatedRouteCors, hostedSessionRouteCors, publicSessionRouteCors } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";

/** `bria/video-erase-object`'s own hard cap — see `inpaint/route.ts`'s own copy of this constant and
 *  doc comment for the full reasoning (including why it's duplicated rather than imported: Next's
 *  App Router only allows a `route.ts` file to export specific reserved names). Kept in sync by
 *  hand, same tradeoff `REMOVE_OBJECT_CREDITS_PER_SECOND`/`REMOVE_OBJECT_FLAT_COST` already accept. */
const BRIA_MAX_CHUNK_SECONDS = 5;

/** A base64 video+mask pair for a clip this route can ever usefully process (`BRIA_MAX_CHUNK_SECONDS`
 *  seconds, see that constant's own doc comment) is a few MB at any realistic bitrate — generous
 *  headroom over that, checked against `Content-Length` before the body is parsed at all, same
 *  up-front-check shape `_lib/importMedia.ts`'s own `downloadMediaUrl` already uses for the identical
 *  "don't let an unbounded request buffer unbounded memory" reason. Not airtight (a client that omits
 *  or lies about `Content-Length` slips past this one check), but real and free — `downloadMediaUrl`'s
 *  own doc comment accepts the same limitation for the same reason. */
const MAX_PREDICT_BODY_BYTES = 100 * 1024 * 1024;

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
 *  own local/non-hosted mode always did successfully before this change.
 *
 *  This route is CORS-enabled and authenticated only by the caller's own bearer token — nothing ties
 *  a request to the app's own UI, so a video's billed duration is measured from the bytes actually
 *  received (`probeMedia`, the same ffprobe helper the export/import pipeline already uses), never
 *  trusted from a request field. An earlier version accepted a client-supplied `costSeconds` here —
 *  the legitimate caller (`inpaint/route.ts`) always computed it correctly from the real clip length,
 *  but nothing stopped a direct, forged request from sending a real, long video alongside a tiny
 *  `costSeconds`: Replicate still bills the real duration regardless of what this route was told, so
 *  that was a real, exploitable gap between what the user was charged and what this call actually
 *  cost to run. */
export const POST = hostedCreditGatedRouteCors("remove-object", REMOVE_OBJECT_FLAT_COST, async (req, user, spend) => {
  const token = getReplicateToken();
  if (!token) throw new ApiError(500, "Remove Object isn't configured on this server", "inpaint-not-configured");

  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PREDICT_BODY_BYTES) {
    throw new ApiError(413, "That clip is too large for Remove Object", "predict-body-too-large");
  }

  const body = (await req.json().catch(() => null)) as {
    kind?: "video" | "image";
    videoBase64?: string;
    imageBase64?: string;
    maskBase64?: string;
  } | null;
  const kind = body?.kind === "image" ? "image" : "video";
  const primaryBase64 = kind === "image" ? body?.imageBase64 : body?.videoBase64;
  const maskBase64 = body?.maskBase64;
  if (!primaryBase64 || !maskBase64) throw new ApiError(400, "Missing video/image or mask", "missing-media");

  const primaryBytes = Buffer.from(primaryBase64, "base64");
  const maskBytes = Buffer.from(maskBase64, "base64");

  // Real cost, measured from the bytes just received — see this route's own doc comment above for
  // why a client-sent duration can never be the billing basis here. Probed (and the probe temp file
  // cleaned up) BEFORE `spend()`, so an unreadable/corrupt upload is rejected as ordinary upfront
  // validation, never charged for — same "validate first, spend once you know the request is real"
  // shape `hostedCreditGatedRoute`'s own doc comment already establishes for this whole route family.
  let cost = REMOVE_OBJECT_FLAT_COST;
  if (kind === "video") {
    const probePath = path.join(os.tmpdir(), `vcut-inpaint-predict-${crypto.randomUUID()}.mp4`);
    await fs.promises.writeFile(probePath, primaryBytes);
    try {
      const probe = await probeMedia(probePath);
      if (probe.duration <= 0) throw new ApiError(400, "That clip's duration couldn't be read", "invalid-video");
      // `BRIA_MAX_CHUNK_SECONDS` (+ a hair of slack for frame-boundary rounding — the legitimate
      // caller's own chunks land essentially exactly on this bound, never meaningfully over it) is
      // the model's own real per-call ceiling, not a number picked here — see that constant's own
      // doc comment. A direct request over it would get silently truncated by Bria while still being
      // billed for the full uploaded length, so it's rejected outright instead.
      if (probe.duration > BRIA_MAX_CHUNK_SECONDS + 0.1) {
        throw new ApiError(400, `Remove Object only processes up to ${BRIA_MAX_CHUNK_SECONDS}s of video per request`, "clip-too-long");
      }
      cost = Math.max(1, Math.ceil(probe.duration * REMOVE_OBJECT_CREDITS_PER_SECOND));
    } finally {
      await fs.promises.unlink(probePath).catch(() => {});
    }
  }
  await spend(cost);

  try {
    const replicate = new Replicate({ auth: token });

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
    // Every path below is reached only after `spend(cost)` already succeeded, so every one of them
    // means the user paid for a prediction that didn't produce a usable result — refunded
    // unconditionally, same as every other credit-gated route in this app (`ai-image`, `ai-video`,
    // `ai-edit`, `ai-background-remove`, `captions/transcribe`). This previously refunded NEITHER the
    // generic-failure nor the cancelled case, and not at all for an `ApiError` raised inside the try
    // block above (a missing model version, a failed result download, no usable output) — a second,
    // related gap this same fix closes.
    void refundCredits(user.id, cost);
    if (err instanceof ApiError) throw err;
    const isAbort = err instanceof Error && err.name === "AbortError";
    if (isAbort) throw new ApiError(499, "Cancelled", "cancelled");
    console.error("[vcut] inpaint/predict: prediction failed:", err);
    throw new ApiError(502, "Remove Object is temporarily unavailable — please try again later.", "inpaint-predict-failed");
  }
});

/** Reports whether the REMOTE half (secret Replicate token) is configured — `client.ts`'s
 *  `inpaintAvailable()` combines this with `inpaint/route.ts`'s own local FFmpeg/local-model check. */
export const HEAD = publicSessionRouteCors(async () => {
  return new Response(null, { status: getReplicateToken() ? 204 : 503 });
});

export const OPTIONS = corsPreflight;
