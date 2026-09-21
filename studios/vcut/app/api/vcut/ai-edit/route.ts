import fs from "fs";
import path from "path";
import Replicate from "replicate";
import { findAsset, findClip } from "@veasnawt/vcut/src/project/createProject";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import type { Asset } from "@veasnawt/vcut/src/project/types";
import { resolveAssetInputPath } from "../_lib/assetInput";
import { getReplicateTokenForGeneration } from "../_lib/externalMediaEnv";
import { extractFirstFramePng } from "../_lib/ffmpeg";
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

/** 6 credits per AI text-guided edit (~$0.02 real provider cost ÷ ~$0.00333 per credit budget). */
const AI_EDIT_CREDITS = 6;

const INSTRUCT_PIX2PIX_OWNER = "timothybrooks";
const INSTRUCT_PIX2PIX_NAME = "instruct-pix2pix";

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
    strength?: "subtle" | "balanced" | "creative";
    deliverBytes?: boolean;
    imageBase64?: string;
  };

  const prompt = body.prompt?.trim();
  if (!prompt) throw new ApiError(400, "Missing prompt", "missing-prompt");

  const replicateToken = getReplicateTokenForGeneration();
  if (!replicateToken) {
    throw new ApiError(503, "AI Edit tool is not configured on this server", "replicate-not-configured");
  }

  const paths = ensureProjectDirs(bpProjectId);
  const userMedia = VCUT_HOSTED && user?.id ? ensureUserMediaDirs(user.id) : null;
  const projectFile = paths.projectFile;

  let inputDataUri: string;
  let baseName = "ai-edit";

  if (body.imageBase64) {
    inputDataUri = body.imageBase64.startsWith("data:") ? body.imageBase64 : `data:image/png;base64,${body.imageBase64}`;
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

    if (targetAsset.kind === "image") {
      const bytes = fs.readFileSync(sourcePath);
      const ext = path.extname(sourcePath).toLowerCase();
      const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
      inputDataUri = `data:${mime};base64,${bytes.toString("base64")}`;
    } else {
      // Video asset: extract the current/first frame as a PNG to apply AI edit
      const frameTempPath = resolveWithin(paths.scratchDir, uniqueFileName("frame-extract.png"));
      try {
        await extractFirstFramePng(sourcePath, frameTempPath);
        const bytes = fs.readFileSync(frameTempPath);
        inputDataUri = `data:image/png;base64,${bytes.toString("base64")}`;
      } finally {
        fs.rm(frameTempPath, { force: true }, () => {});
      }
    }
  } else {
    throw new ApiError(400, "Missing assetId, clipId, or imageBase64", "missing-input");
  }

  // Deduct credits upfront
  await spend();

  const replicate = new Replicate({ auth: replicateToken });

  // Map strength to image guidance and text guidance scale
  const imageGuidanceScale = body.strength === "subtle" ? 2.0 : body.strength === "creative" ? 1.2 : 1.5;
  const guidanceScale = body.strength === "subtle" ? 6.5 : body.strength === "creative" ? 8.5 : 7.5;

  let resultBuffer: Buffer;
  try {
    const model = await replicate.models.get(INSTRUCT_PIX2PIX_OWNER, INSTRUCT_PIX2PIX_NAME);
    const versionId = model.latest_version?.id;
    if (!versionId) throw new ApiError(500, "AI Edit model version not found", "model-version-missing");

    const output = await replicate.run(`${INSTRUCT_PIX2PIX_OWNER}/${INSTRUCT_PIX2PIX_NAME}:${versionId}`, {
      input: {
        image: inputDataUri,
        prompt,
        image_guidance_scale: imageGuidanceScale,
        guidance_scale: guidanceScale,
        num_inference_steps: 25,
      },
    });

    resultBuffer = await extractReplicateMediaBytes(output, "AI Edit returned no output", "ai-edit-no-output");
  } catch (err) {
    if (VCUT_HOSTED && user?.id) void refundCredits(user.id, AI_EDIT_CREDITS);
    throw err;
  }

  if (VCUT_HOSTED && user?.id) {
    const profile = await getProfile(user.id);
    await checkStorageQuota(user.id, profile?.plan ?? "free", resultBuffer.length);
  }

  const writeTarget = userMedia ?? paths;
  const suggestedName = `${baseName}-ai-edit.png`;
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
      aiGeneration: { prompt, aspectRatio: "custom", model: INSTRUCT_PIX2PIX_NAME },
      hidden: false,
    });
    newAsset.libraryMediaId = newAsset.id;
  }

  const bytesBase64 = body.deliverBytes ? resultBuffer.toString("base64") : undefined;
  return Response.json({ asset: newAsset, ...(bytesBase64 ? { bytesBase64 } : null) });
});

export const OPTIONS = corsPreflight;

