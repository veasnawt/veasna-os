import fs from "fs";
import Replicate from "replicate";
import { findAsset, findClip } from "@veasnawt/vcut/src/project/createProject";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import { AI_EDIT_IMAGE_CREDITS, AI_EDIT_PRESERVE_KEYS, buildAiEditInstruction, clampCreativity, creativityFromStrength, type AiEditPreserve } from "@veasnawt/vcut/src/project/aiEdit";
import type { Asset } from "@veasnawt/vcut/src/project/types";
import { IMAGE_EDIT_MODELS, runEditChain, uploadForModel } from "../_lib/aiEditModels";
import { resolveAssetInputPath } from "../_lib/assetInput";
import { getReplicateTokenForGeneration } from "../_lib/externalMediaEnv";
import { extractAiFramePng } from "../_lib/ffmpeg";
import { importMediaBytes } from "../_lib/importMedia";
import { corsPreflight, hostedCreditGatedRouteCors } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs, ensureUserMediaDirs, resolveWithin, uniqueFileName } from "../_lib/paths";
import { getProfile } from "../_lib/profiles";
import { extractReplicateMediaBytes } from "../_lib/replicateOutput";
import { checkStorageQuota, insertUserMedia } from "../_lib/userMedia";
import { VCUT_HOSTED } from "../_lib/auth";
import { refundCredits } from "../_lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One picture edit costs what the premium image model does (see `ai-image/route.ts`'s sunburst): $0.0527 ÷ ~$0.00333. */
const AI_EDIT_CREDITS = AI_EDIT_IMAGE_CREDITS;

/** `POST /api/vcut/ai-edit?projectId=...`
 *  Accepts `{ assetId, clipId, prompt, strength, deliverBytes, imageBase64 }`.
 *  Takes an existing image or video frame, applies the user's text instruction using AI
 *  (e.g., "turn into anime style", "add sunglasses", "change background to a cyberpunk neon city"),
 *  and saves the edited image as a new Asset in the project. */
export const POST = hostedCreditGatedRouteCors("ai-edit", AI_EDIT_CREDITS, async (req, user, spend) => {
  const bpProjectId = new URL(req.url).searchParams.get("projectId");
  if (!bpProjectId) throw new ApiError(400, "Missing projectId", "missing-project-id");

  const body = (await req.json().catch(() => ({}))) as {
    assetId?: string;
    clipId?: string;
    prompt?: string;
    /** Old clients (and old template recipes) send a three-step strength instead of `creativity`. */
    strength?: "subtle" | "balanced" | "creative";
    /** 0 faithful .. 100 imaginative. */
    creativity?: number;
    preserve?: string[];
    deliverBytes?: boolean;
    imageBase64?: string;
    /** Source-media seconds of the frame to use when the asset is a video (the playhead frame); defaults to the start. */
    timeSeconds?: number;
  };

  const prompt = body.prompt?.trim();
  if (!prompt) throw new ApiError(400, "Missing prompt", "missing-prompt");

  const replicateToken = getReplicateTokenForGeneration();
  if (!replicateToken) {
    throw new ApiError(503, "AI Edit tool is not configured on this server", "replicate-not-configured");
  }

  const preserve = (Array.isArray(body.preserve) ? body.preserve : []).filter((k): k is AiEditPreserve => (AI_EDIT_PRESERVE_KEYS as readonly string[]).includes(k));
  const creativity = body.creativity === undefined ? creativityFromStrength(body.strength) : clampCreativity(body.creativity);
  const instruction = buildAiEditInstruction(prompt, { preserve, creativity }, "image");

  const paths = ensureProjectDirs(bpProjectId);
  const userMedia = VCUT_HOSTED && user?.id ? ensureUserMediaDirs(user.id) : null;
  const projectFile = paths.projectFile;

  let inputBytes: Buffer;
  let inputMime = "image/png";
  let baseName = "ai-edit";

  if (body.imageBase64) {
    const base64 = body.imageBase64.replace(/^data:[^;]+;base64,/, "");
    inputBytes = Buffer.from(base64, "base64");
  } else if (body.assetId || body.clipId) {
    if (!fs.existsSync(projectFile)) throw new ApiError(404, "Project not found", "project-missing");
    const rawProject = deserializeProject(fs.readFileSync(projectFile, "utf-8"));

    let targetAsset: Asset | undefined;
    if (body.clipId) {
      const found = findClip(rawProject, body.clipId);
      if (!found) throw new ApiError(404, "Clip not found", "clip-missing");
      targetAsset = findAsset(rawProject, found.clip.assetId);
    } else if (body.assetId) {
      targetAsset = findAsset(rawProject, body.assetId);
    }

    if (!targetAsset) throw new ApiError(404, "Asset not found", "asset-missing");
    baseName = targetAsset.name.replace(/\.[^.]+$/, "");

    const sourcePath = resolveAssetInputPath(paths, userMedia?.mediaDir ?? null, targetAsset);
    if (!fs.existsSync(sourcePath)) throw new ApiError(404, "Source file not found", "source-missing");

    // Always downscale through FFmpeg (video frame OR large photo): the models allocate memory in proportion to the
    // pixel count, and a full-resolution phone frame ran the GPU out of memory.
    const frameTempPath = resolveWithin(paths.scratchDir, uniqueFileName("frame-extract.png"));
    try {
      const at = targetAsset.kind === "video" && typeof body.timeSeconds === "number" && body.timeSeconds > 0 ? body.timeSeconds : undefined;
      await extractAiFramePng(sourcePath, frameTempPath, { maxEdge: 1536, multipleOf: 8, atSeconds: at, alpha: false });
      inputBytes = fs.readFileSync(frameTempPath);
    } finally {
      fs.rm(frameTempPath, { force: true }, () => {});
    }
  } else {
    throw new ApiError(400, "Missing assetId, clipId, or imageBase64", "missing-input");
  }

  // Deduct credits upfront
  await spend();

  const replicate = new Replicate({ auth: replicateToken });

  let resultBuffer: Buffer;
  let modelId: string;
  try {
    const image = await uploadForModel(replicate, inputBytes, inputMime);
    const result = await runEditChain(replicate, IMAGE_EDIT_MODELS, { prompt: instruction, image }, { signal: req.signal, noOutputMessage: "AI Edit returned no output", noOutputCode: "ai-edit-no-output" });
    resultBuffer = result.bytes;
    modelId = result.modelId;
  } catch (err) {
    if (VCUT_HOSTED && user?.id) void refundCredits(user.id, AI_EDIT_CREDITS);
    throw err instanceof ApiError ? err : new ApiError(502, "AI Edit is temporarily unavailable — please try again in a moment", "ai-edit-unavailable");
  }

  if (VCUT_HOSTED && user?.id) {
    const profile = await getProfile(user.id);
    await checkStorageQuota(user.id, profile?.plan ?? "free", resultBuffer.length);
  }

  const writeTarget = userMedia ?? paths;
  const suggestedName = `${baseName}-ai-edit.png`; // the models are asked for png
  const newAsset = await importMediaBytes(writeTarget, resultBuffer, suggestedName);
  newAsset.name = `${baseName} (AI: ${prompt.slice(0, 20)})`;

  if (userMedia && user?.id) {
    await insertUserMedia(user.id, {
      id: newAsset.id,
      kind: "image",
      name: newAsset.name,
      relPath: newAsset.relPath,
      thumbnailRelPath: newAsset.thumbnailRelPath ?? null,
      filmstripRelPath: newAsset.filmstripRelPath ?? null,
      waveformRelPath: newAsset.waveformRelPath ?? null,
      duration: newAsset.duration,
      width: newAsset.width ?? null,
      height: newAsset.height ?? null,
      fps: newAsset.fps ?? null,
      hasAudio: newAsset.hasAudio,
      sizeBytes: newAsset.sizeBytes,
      aiGeneration: { prompt, aspectRatio: "custom", model: modelId },
      hidden: false,
    });
    newAsset.libraryMediaId = newAsset.id;
  }

  const bytesBase64 = body.deliverBytes ? resultBuffer.toString("base64") : undefined;
  return Response.json({ asset: newAsset, ...(bytesBase64 ? { bytesBase64 } : null) });
});

export const OPTIONS = corsPreflight;

