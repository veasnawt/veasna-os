import fs from "fs";
import Replicate from "replicate";
import { findAsset, findClip } from "@veasnawt/vcut/src/project/createProject";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import type { Asset } from "@veasnawt/vcut/src/project/types";
import { resolveAssetInputPath } from "../_lib/assetInput";
import { getReplicateTokenForGeneration } from "../_lib/externalMediaEnv";
import { extractAiFramePng } from "../_lib/ffmpeg";
import { importMediaBytes } from "../_lib/importMedia";
import { corsPreflight, hostedCreditGatedRouteCors } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs, ensureUserMediaDirs, resolveWithin, uniqueFileName, userMediaPaths } from "../_lib/paths";
import { getProfile } from "../_lib/profiles";
import { extractReplicateMediaBytes } from "../_lib/replicateOutput";
import { checkStorageQuota, insertUserMedia } from "../_lib/userMedia";
import { VCUT_HOSTED } from "../_lib/auth";
import { refundCredits } from "../_lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 3 credits per background removal (~$0.01 real provider cost ÷ ~$0.00333 per credit budget),
 *  matching VCut's standard ~60% margin target. */
const AI_BG_REMOVE_CREDITS = 3;

const RMBG_PRIMARY_MODEL = "bria/remove-background";
const RMBG_FALLBACK_MODEL = "lucataco/remove-bg";

/** `POST /api/vcut/ai-background-remove?projectId=...`
 *  Accepts `{ assetId, clipId, deliverBytes, imageBase64 }`.
 *  Takes an image (or extracts the active video frame), runs AI subject cutout via BRIA background removal,
 *  and saves the resulting transparent PNG as a new Asset in the project. */
export const POST = hostedCreditGatedRouteCors("ai-bg-remove", AI_BG_REMOVE_CREDITS, async (req, user, spend) => {
  const bpProjectId = new URL(req.url).searchParams.get("projectId");
  if (!bpProjectId) throw new ApiError(400, "Missing projectId", "missing-project-id");

  const body = (await req.json().catch(() => ({}))) as {
    assetId?: string;
    clipId?: string;
    deliverBytes?: boolean;
    imageBase64?: string;
    /** Source-media seconds of the frame to use when the asset is a video (the playhead frame); defaults to the start. */
    timeSeconds?: number;
  };

  const replicateToken = getReplicateTokenForGeneration();
  if (!replicateToken) {
    throw new ApiError(503, "AI Background Remover is not configured on this server", "replicate-not-configured");
  }

  const paths = ensureProjectDirs(bpProjectId);
  const userMedia = VCUT_HOSTED && user?.id ? ensureUserMediaDirs(user.id) : null;
  const projectFile = paths.projectFile;

  let inputDataUri: string;
  let baseName = "cutout";

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

    // Always downscale through FFmpeg (video frame OR large photo): the models allocate memory in proportion to the
    // pixel count, and a full-resolution phone frame ran the GPU out of memory.
    const frameTempPath = resolveWithin(paths.scratchDir, uniqueFileName("frame-extract.png"));
    try {
      const at = targetAsset.kind === "video" && typeof body.timeSeconds === "number" && body.timeSeconds > 0 ? body.timeSeconds : undefined;
      await extractAiFramePng(sourcePath, frameTempPath, { maxEdge: 2048, multipleOf: 2, atSeconds: at, alpha: true });
      const bytes = fs.readFileSync(frameTempPath);
      inputDataUri = `data:image/png;base64,${bytes.toString("base64")}`;
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
  try {
    let output: unknown;
    try {
      output = await replicate.run(RMBG_PRIMARY_MODEL as `${string}/${string}`, {
        input: { image: inputDataUri },
      });
    } catch (primaryErr) {
      console.warn("bria/remove-background failed, falling back to lucataco/remove-bg", primaryErr);
      output = await replicate.run(RMBG_FALLBACK_MODEL as `${string}/${string}`, {
        input: { image: inputDataUri },
      });
    }

    resultBuffer = await extractReplicateMediaBytes(output, "AI Background Remover returned no output", "bg-remove-no-output");
  } catch (err) {
    if (VCUT_HOSTED && user?.id) void refundCredits(user.id, AI_BG_REMOVE_CREDITS);
    throw err;
  }

  if (VCUT_HOSTED && user?.id) {
    const profile = await getProfile(user.id);
    await checkStorageQuota(user.id, profile?.plan ?? "free", resultBuffer.length);
  }

  const writeTarget = userMedia ?? paths;
  const suggestedName = `${baseName}-cutout.png`;
  const newAsset = await importMediaBytes(writeTarget, resultBuffer, suggestedName);
  newAsset.name = `${baseName} (Cutout)`;

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
      aiGeneration: { prompt: "Remove background", aspectRatio: "custom", model: RMBG_PRIMARY_MODEL },
      hidden: false,
    });
    newAsset.libraryMediaId = newAsset.id;
  }

  const bytesBase64 = body.deliverBytes ? resultBuffer.toString("base64") : undefined;
  return Response.json({ asset: newAsset, ...(bytesBase64 ? { bytesBase64 } : null) });
});

export const OPTIONS = corsPreflight;

