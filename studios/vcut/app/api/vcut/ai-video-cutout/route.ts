import fs from "fs";
import Replicate from "replicate";
import { findAsset, findClip } from "@veasnawt/vcut/src/project/createProject";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import { resolveAssetInputPath } from "../_lib/assetInput";
import { getReplicateTokenForGeneration } from "../_lib/externalMediaEnv";
import { extractCutoutInput, muxOriginalAudio, probeCornerColor } from "../_lib/ffmpeg";
import { importMediaBytes, downloadMediaUrl } from "../_lib/importMedia";
import { corsPreflight, hostedCreditGatedRouteCors } from "../_lib/localOnly";
import { ApiError, ensureProjectDirs, ensureUserMediaDirs, resolveWithin, uniqueFileName } from "../_lib/paths";
import { getProfile } from "../_lib/profiles";
import { checkStorageQuota, insertUserMedia } from "../_lib/userMedia";
import { VCUT_HOSTED } from "../_lib/auth";
import { refundCredits } from "../_lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Matting a clip takes a minute or two; give the platform room instead of its default request limit.
export const maxDuration = 300;

/** Longest clip (seconds of source) this will cut out — keeps a run to about a minute and a few cents. */
const MAX_CUTOUT_SECONDS = 15;
/** Credits per second of footage, with a floor (`cutoutCredits`). Real cost is a few cents per run on Replicate. */
const CREDITS_PER_SECOND = 2;
const MIN_CREDITS = 3;

function cutoutCredits(seconds: number): number {
  return Math.max(MIN_CREDITS, Math.ceil(seconds * CREDITS_PER_SECOND));
}

const MATTING_OWNER = "arielreplicate";
const MATTING_NAME = "robust_video_matting";

/** `POST /api/vcut/ai-video-cutout?projectId=...` with `{ clipId, keepAudio, deliverBytes }`.
 *  Cuts the subject out of a VIDEO clip, frame by frame (Robust Video Matting, "green-screen" output): the removed
 *  background comes back as a flat colour, which the editor's own Chroma Key then makes transparent in preview and in
 *  export. Returns the new video asset plus that colour (`keyColor`) and the length of the clip window it covers. */
export const POST = hostedCreditGatedRouteCors("ai-video-cutout", MIN_CREDITS, async (req, user, spend) => {
  const bpProjectId = new URL(req.url).searchParams.get("projectId");
  if (!bpProjectId) throw new ApiError(400, "Missing projectId", "missing-project-id");
  const body = (await req.json().catch(() => ({}))) as { clipId?: string; keepAudio?: boolean; deliverBytes?: boolean };
  if (!body.clipId) throw new ApiError(400, "Missing clipId", "missing-clip");

  const replicateToken = getReplicateTokenForGeneration();
  if (!replicateToken) throw new ApiError(503, "Video cutout is not configured on this server", "replicate-not-configured");

  const paths = ensureProjectDirs(bpProjectId);
  const userMedia = VCUT_HOSTED && user?.id ? ensureUserMediaDirs(user.id) : null;
  if (!fs.existsSync(paths.projectFile)) throw new ApiError(404, "Project not found", "project-missing");
  const project = deserializeProject(fs.readFileSync(paths.projectFile, "utf-8"));
  const found = findClip(project, body.clipId);
  if (!found) throw new ApiError(404, "Clip not found", "clip-missing");
  const asset = findAsset(project, found.clip.assetId);
  if (!asset || asset.kind !== "video") throw new ApiError(400, "Video cutout works on video clips", "not-a-video");

  const windowSeconds = found.clip.sourceOut - found.clip.sourceIn;
  if (windowSeconds > MAX_CUTOUT_SECONDS + 0.05) {
    throw new ApiError(400, `Cutout works on clips up to ${MAX_CUTOUT_SECONDS} seconds — split this clip first`, "cutout-too-long");
  }

  const sourcePath = resolveAssetInputPath(paths, userMedia?.mediaDir ?? null, asset);
  if (!fs.existsSync(sourcePath)) throw new ApiError(404, "Source file not found", "source-missing");

  const credits = cutoutCredits(windowSeconds);
  await spend(credits);

  const baseName = asset.name.replace(/\.[^.]+$/, "");
  const inputPath = resolveWithin(paths.scratchDir, uniqueFileName("cutout-input.mp4"));
  const greenPath = resolveWithin(paths.scratchDir, uniqueFileName("cutout-green.mp4"));
  const finalPath = resolveWithin(paths.scratchDir, uniqueFileName("cutout-final.mp4"));
  let resultBuffer: Buffer;
  let keyColor: string;
  try {
    await extractCutoutInput(sourcePath, inputPath, { startSeconds: found.clip.sourceIn, durationSeconds: windowSeconds });

    const replicate = new Replicate({ auth: replicateToken });
    const model = await replicate.models.get(MATTING_OWNER, MATTING_NAME);
    const versionId = model.latest_version?.id;
    if (!versionId) throw new ApiError(500, "Video cutout model version not found", "model-version-missing");

    let inputUrl: string;
    try {
      const uploaded = await replicate.files.create(new Blob([fs.readFileSync(inputPath)], { type: "video/mp4" }));
      inputUrl = uploaded.urls.get;
    } catch {
      inputUrl = `data:video/mp4;base64,${fs.readFileSync(inputPath).toString("base64")}`;
    }

    const output = await replicate.run(`${MATTING_OWNER}/${MATTING_NAME}:${versionId}`, {
      input: { input_video: inputUrl, output_type: "green-screen" },
    });
    const outUrl =
      typeof output === "string"
        ? output
        : output && typeof (output as { url?: () => URL | string }).url === "function"
          ? String((output as { url: () => URL | string }).url())
          : Array.isArray(output) && typeof output[0] === "string"
            ? output[0]
            : null;
    if (!outUrl) throw new ApiError(502, "Video cutout returned no output", "cutout-no-output");
    fs.writeFileSync(greenPath, await downloadMediaUrl(outUrl));

    keyColor = await probeCornerColor(greenPath);
    if (body.keepAudio && asset.hasAudio) {
      await muxOriginalAudio(greenPath, sourcePath, finalPath, { startSeconds: found.clip.sourceIn, durationSeconds: windowSeconds });
      resultBuffer = fs.readFileSync(finalPath);
    } else {
      resultBuffer = fs.readFileSync(greenPath);
    }
  } catch (err) {
    if (VCUT_HOSTED && user?.id) void refundCredits(user.id, credits);
    throw err;
  } finally {
    for (const f of [inputPath, greenPath, finalPath]) fs.rm(f, { force: true }, () => {});
  }

  if (VCUT_HOSTED && user?.id) {
    const profile = await getProfile(user.id);
    await checkStorageQuota(user.id, profile?.plan ?? "free", resultBuffer.length);
  }

  const writeTarget = userMedia ?? paths;
  const newAsset = await importMediaBytes(writeTarget, resultBuffer, `${baseName}-cutout.mp4`);
  newAsset.name = `${baseName} (Cutout)`;
  if (userMedia && user?.id) {
    await insertUserMedia(user.id, {
      id: newAsset.id,
      kind: "video",
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
      aiGeneration: { prompt: "Video cutout", aspectRatio: "custom", model: MATTING_NAME },
      hidden: false,
    });
    newAsset.libraryMediaId = newAsset.id;
  }

  const bytesBase64 = body.deliverBytes ? resultBuffer.toString("base64") : undefined;
  return Response.json({ asset: newAsset, keyColor, windowSeconds, ...(bytesBase64 ? { bytesBase64 } : null) });
});

export const OPTIONS = corsPreflight;
