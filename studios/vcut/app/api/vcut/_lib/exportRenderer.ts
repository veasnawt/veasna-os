import { execFile, type ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { buildExportPlan, clipNeedsBrowserTextRender } from "@veasnawt/vcut/src/export/buildExportPlan";
import { renderKhmerClipWindows, type KhmerTextWindow } from "@veasnawt/vcut/src/export/khmerTextRenderer";
import { clipHasParentAnimation, parentPose } from "@veasnawt/vcut/src/project/groups";
import {
  OUTRO_BG_ASSET_ID,
  OUTRO_BG_SIZE,
  OUTRO_CACHE_VERSION,
  OUTRO_DURATION_SECONDS,
  OUTRO_FADE_SECONDS,
  OUTRO_LOGO_ASSET_ID,
  OUTRO_LOGO_HEIGHT,
  OUTRO_LOGO_SCALE,
  OUTRO_LOGO_WIDTH,
  OUTRO_TEXT_CONTENT,
  outroLogoOffsetY,
  outroTextStyle,
} from "@veasnawt/vcut/src/export/outro";
import { createClip, createTextAsset, createTrack } from "@veasnawt/vcut/src/project/createProject";
import { isIdentityTextCrop, type Clip, type Project } from "@veasnawt/vcut/src/project/types";
import { hasTextCropKeyframes, hasTextStyleKeyframes, resolveTextCrop, resolveTextStyle } from "@veasnawt/vcut/src/timeline/keyframes";
import { resolveAssetInputPath } from "./assetInput";
import { VCUT_HOSTED } from "./auth";
import { ffmpegBinary, fontMetricsFor, fontsDirPath, probeMedia, runFfmpeg, textFontPath } from "./ffmpeg";
import { buildCustomFontDataUrls, openKhmerTextHarness } from "./khmerTextHarness";
import { resolveLutFilePath } from "./lutFile";
import { outroBackgroundPath, outroLogoPath } from "./outroAssets";
import { ApiError, type ProjectPaths, resolveWithin, VCUT_ROOT } from "./paths";

export const MAX_HOSTED_IMAGE_DIMENSION = 2200;
export const MAX_BROWSER_TEXT_WINDOWS_PER_EXPORT =
  Number(process.env.VCUT_MAX_TEXT_WINDOWS) || (process.env.VCUT_HOSTED === "true" ? 7200 : Infinity);
export const OUTRO_CRF = 18;

export function resolveOutroAssetPath(assetId: string): string | null {
  if (assetId === OUTRO_LOGO_ASSET_ID) return outroLogoPath();
  if (assetId === OUTRO_BG_ASSET_ID) return outroBackgroundPath();
  return null;
}

export function outroCacheDir(): string {
  const dir = path.join(VCUT_ROOT, "outro-cache");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function buildOutroOnlyProject(project: Project): Project {
  const bgAsset = {
    id: OUTRO_BG_ASSET_ID,
    kind: "image" as const,
    name: "Outro background",
    relPath: "",
    duration: 0,
    hasAudio: false,
    sizeBytes: 0,
    importedAt: Date.now(),
    width: OUTRO_BG_SIZE,
    height: OUTRO_BG_SIZE,
  };
  const logoAsset = {
    id: OUTRO_LOGO_ASSET_ID,
    kind: "image" as const,
    name: "VCut logo",
    relPath: "",
    duration: 0,
    hasAudio: false,
    sizeBytes: 0,
    importedAt: Date.now(),
    width: OUTRO_LOGO_WIDTH,
    height: OUTRO_LOGO_HEIGHT,
  };

  const bgTrack = createTrack("video", "Outro Background");
  bgTrack.clips.push(createClip({ assetId: bgAsset.id, sourceIn: 0, sourceOut: OUTRO_DURATION_SECONDS, timelineStart: 0 }));

  const logoTrack = createTrack("video", "Outro Logo");
  const logoClip = createClip({ assetId: logoAsset.id, sourceIn: 0, sourceOut: OUTRO_DURATION_SECONDS, timelineStart: 0 });
  logoClip.transform = {
    offsetX: 0,
    offsetY: outroLogoOffsetY(project.sequence.width, project.sequence.height),
    scale: OUTRO_LOGO_SCALE,
    rotationDeg: 0,
    crop: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  logoClip.transitionIn = { duration: OUTRO_FADE_SECONDS, type: "crossfade" };
  logoClip.transitionOut = { duration: OUTRO_FADE_SECONDS, type: "crossfade" };
  logoTrack.clips.push(logoClip);

  const textAsset = createTextAsset(OUTRO_TEXT_CONTENT, outroTextStyle(project.sequence.width, project.sequence.height));
  const textTrack = createTrack("text", "Outro Text");
  const textClip = createClip({ assetId: textAsset.id, sourceIn: 0, sourceOut: OUTRO_DURATION_SECONDS, timelineStart: 0 });
  textClip.transitionIn = { duration: OUTRO_FADE_SECONDS, type: "crossfade" };
  textClip.transitionOut = { duration: OUTRO_FADE_SECONDS, type: "crossfade" };
  textTrack.clips.push(textClip);

  return {
    ...project,
    assets: [bgAsset, logoAsset, textAsset],
    sequence: { ...project.sequence, tracks: [bgTrack, logoTrack, textTrack] },
  };
}

export async function getOrRenderOutroVariant(project: Project, scratchDir: string): Promise<string> {
  const { width, height, fps } = project.sequence;
  const cacheDir = outroCacheDir();
  const cachePath = path.join(cacheDir, `outro-v${OUTRO_CACHE_VERSION}-${width}x${height}-${fps}fps.mp4`);
  if (fs.existsSync(cachePath)) return cachePath;

  const outroProject = buildOutroOnlyProject(project);
  const renderPath = path.join(cacheDir, `.tmp-${crypto.randomUUID()}.mp4`);
  const outroPlan = buildExportPlan(outroProject, {
    inputPathFor: (assetId) => {
      const resolved = resolveOutroAssetPath(assetId);
      if (!resolved) throw new ApiError(500, "Unexpected asset in outro-only project", "outro-bad-asset");
      return resolved;
    },
    outputPath: renderPath,
    fontPathFor: (fileName) => textFontPath(fileName),
    textFilePathFor: (clip, content, variant) => {
      const filePath = path.join(scratchDir, `outro-${clip.id}${variant ? `-${variant}` : ""}.txt`);
      fs.writeFileSync(filePath, content, "utf8");
      return filePath;
    },
    assFilePathFor: (clip, assContent) => {
      const filePath = path.join(scratchDir, `outro-${clip.id}.ass`);
      fs.writeFileSync(filePath, assContent, "utf8");
      return filePath;
    },
    fontMetricsFor,
    fontsDirFor: fontsDirPath,
    khmerTextWindowsFor: () => undefined,
    ...(VCUT_HOSTED ? { videoEncoderArgs: ["-c:v", "libx264", "-preset", "medium", "-crf", String(OUTRO_CRF), "-threads", "8"] } : null),
  });

  try {
    const outroRun = runFfmpeg(outroPlan.args, outroPlan.duration, () => {});
    await outroRun.done;
    fs.renameSync(renderPath, cachePath);
    return cachePath;
  } catch (err) {
    fs.rmSync(renderPath, { force: true });
    throw err;
  }
}

export async function runOutroStep(project: Project, scratchDir: string, mainPath: string, finalPath: string): Promise<void> {
  const outroPath = await getOrRenderOutroVariant(project, scratchDir);

  const listPath = path.join(scratchDir, "concat-list.txt");
  const escaped = (p: string) => p.replace(/'/g, "'\\''");
  fs.writeFileSync(listPath, `file '${escaped(mainPath)}'\nfile '${escaped(outroPath)}'\n`, "utf8");

  await new Promise<void>((resolve, reject) => {
    execFile(
      ffmpegBinary(),
      ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", finalPath],
      { timeout: 30_000 },
      (err) => (err ? reject(err) : resolve())
    );
  });
}

export async function extractCoverFrameJpeg(scratchDir: string, videoPath: string, time: number): Promise<string> {
  const coverJpegPath = path.join(scratchDir, "cover.jpg");
  await new Promise<void>((resolve, reject) => {
    execFile(
      ffmpegBinary(),
      ["-y", "-ss", String(Math.max(0, time)), "-i", videoPath, "-frames:v", "1", "-q:v", "2", coverJpegPath],
      { timeout: 30_000 },
      (err) => (err ? reject(err) : resolve())
    );
  });
  return coverJpegPath;
}

export async function runCoverArtStep(videoPath: string, coverImagePath: string): Promise<void> {
  const muxedPath = path.join(path.dirname(videoPath), `.tmp-cover-${crypto.randomUUID()}.mp4`);
  await new Promise<void>((resolve, reject) => {
    execFile(
      ffmpegBinary(),
      [
        "-y",
        "-i",
        videoPath,
        "-i",
        coverImagePath,
        "-map",
        "0",
        "-map",
        "1",
        "-c",
        "copy",
        "-c:v:1",
        "mjpeg",
        "-disposition:v:1",
        "attached_pic",
        "-movflags",
        "+faststart",
        muxedPath,
      ],
      { timeout: 30_000 },
      (err) => (err ? reject(err) : resolve())
    );
  });
  fs.renameSync(muxedPath, videoPath);
}

export async function prescaleOversizedImageAssets(
  project: Project,
  paths: ProjectPaths,
  scratchDir: string,
  libraryMediaDir: string | null
): Promise<Map<string, string>> {
  const overrides = new Map<string, string>();
  if (!VCUT_HOSTED) return overrides;

  for (const asset of project.assets) {
    if (asset.kind !== "image") continue;
    const sourcePath = resolveAssetInputPath(paths, libraryMediaDir, asset);
    const probe = await probeMedia(sourcePath).catch(() => null);
    if (!probe?.width || !probe.height) continue;
    if (probe.width <= MAX_HOSTED_IMAGE_DIMENSION && probe.height <= MAX_HOSTED_IMAGE_DIMENSION) continue;

    const scaledPath = path.join(scratchDir, `${asset.id}-scaled${path.extname(asset.relPath) || ".jpg"}`);
    const scaleFilter =
      probe.width >= probe.height ? `scale=${MAX_HOSTED_IMAGE_DIMENSION}:-2` : `scale=-2:${MAX_HOSTED_IMAGE_DIMENSION}`;
    const ok = await new Promise<boolean>((resolve) => {
      execFile(ffmpegBinary(), ["-y", "-i", sourcePath, "-vf", scaleFilter, scaledPath], { timeout: 30_000 }, (err) =>
        resolve(!err && fs.existsSync(scaledPath))
      );
    });
    if (ok) overrides.set(asset.id, scaledPath);
  }
  return overrides;
}

export interface RenderExportCallbacks {
  onPhase?: (phase: "preparing" | "rendering-text" | "encoding" | "finalizing", message?: string) => void;
  onProgress?: (fraction: number) => void;
  isCancelled?: () => boolean;
  onProcessSpawned?: (proc: ChildProcess, cancel: () => void) => void;
}

/** Executes the complete export rendering pipeline with 100% parity between web and worker processes. */
export async function executeExportRender(options: {
  project: Project;
  paths: ProjectPaths;
  outputPath: string;
  harnessBaseUrl: string;
  includeOutro: boolean;
  libraryMediaDir: string | null;
  callbacks?: RenderExportCallbacks;
}): Promise<{ outputPath: string }> {
  const { project, paths, outputPath, harnessBaseUrl, includeOutro, libraryMediaDir, callbacks } = options;

  const textFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), "vcut-text-"));
  const mainOutputPath = includeOutro ? path.join(textFilesDir, "main.mp4") : outputPath;

  try {
    const khmerClips = project.sequence.tracks
      .filter((track) => track.kind === "text")
      .flatMap((track) => track.clips)
      .filter((clip) => {
        const asset = project.assets.find((a) => a.id === clip.assetId);
        if (!asset?.textContent || !asset.textStyle) return false;
        return (
          clip.groupId ||
          clip.transformLayers?.length ||
          hasTextStyleKeyframes(clip) ||
          hasTextCropKeyframes(clip) ||
          !isIdentityTextCrop(resolveTextCrop(clip, 0)) ||
          clipNeedsBrowserTextRender(clip, asset.textContent, resolveTextStyle(clip, 0, asset.textStyle))
        );
      });

    const khmerWindowsByClipId = new Map<string, KhmerTextWindow[]>();
    if (khmerClips.length > 0) {
      callbacks?.onPhase?.("rendering-text", "Preparing text overlays…");
      if (callbacks?.isCancelled?.()) throw new ApiError(499, "Export cancelled", "cancelled");

      const customFontUrls = buildCustomFontDataUrls(paths.customFontsDir, project.customFonts);
      const harness = await openKhmerTextHarness(harnessBaseUrl, textFilesDir, customFontUrls);
      try {
        let rendered = 0;
        let totalWindows = 0;
        for (const clip of khmerClips) {
          if (callbacks?.isCancelled?.()) throw new ApiError(499, "Export cancelled", "cancelled");
          if (totalWindows >= MAX_BROWSER_TEXT_WINDOWS_PER_EXPORT) {
            throw new ApiError(
              400,
              "This export exceeds the animated text frame limit. Export a shorter range to preserve its appearance.",
              "text-frame-limit"
            );
          }
          const asset = project.assets.find((a) => a.id === clip.assetId)!;
          const windows = await renderKhmerClipWindows(clip, asset.textContent!, asset.textStyle!, {
            parentAnimated: clipHasParentAnimation(project, clip),
            frameWidth: project.sequence.width,
            frameHeight: project.sequence.height,
            fps: project.exportSettings.fps,
            customFonts: project.customFonts,
            renderFrame: async (params) => {
              if (++totalWindows > MAX_BROWSER_TEXT_WINDOWS_PER_EXPORT) {
                throw new ApiError(
                  400,
                  "This export exceeds the animated text frame limit. Export a shorter range to preserve its appearance.",
                  "text-frame-limit"
                );
              }
              return harness.renderFrame({
                ...params,
                crop: resolveTextCrop(clip, params.elapsedSeconds),
                groupPose: parentPose(project, clip, clip.timelineStart + params.elapsedSeconds),
              });
            },
          });
          khmerWindowsByClipId.set(clip.id, windows);

          rendered++;
          callbacks?.onPhase?.("rendering-text", `Rendering text overlay ${rendered} of ${khmerClips.length}…`);
        }
      } finally {
        await harness.close();
      }
    }

    if (callbacks?.isCancelled?.()) throw new ApiError(499, "Export cancelled", "cancelled");
    callbacks?.onPhase?.("preparing", "Preparing to render…");

    const scaledImagePaths = await prescaleOversizedImageAssets(project, paths, textFilesDir, libraryMediaDir);

    const plan = buildExportPlan(project, {
      inputPathFor: (assetId) => {
        const outroPath = resolveOutroAssetPath(assetId);
        if (outroPath) return outroPath;
        const asset = project.assets.find((a) => a.id === assetId);
        if (!asset) throw new ApiError(400, "A clip references media that is no longer in the project", "missing-asset");
        return scaledImagePaths.get(assetId) ?? resolveAssetInputPath(paths, libraryMediaDir, asset);
      },
      outputPath: mainOutputPath,
      fontPathFor: (fileName) => textFontPath(fileName),
      textFilePathFor: (clip, content, variant) => {
        const filePath = path.join(textFilesDir, `${clip.id}${variant ? `-${variant}` : ""}.txt`);
        fs.writeFileSync(filePath, content, "utf8");
        return filePath;
      },
      assFilePathFor: (clip, assContent) => {
        const filePath = path.join(textFilesDir, `${clip.id}.ass`);
        fs.writeFileSync(filePath, assContent, "utf8");
        return filePath;
      },
      fontMetricsFor,
      fontsDirFor: fontsDirPath,
      lutPathFor: (lutId, intensity) => resolveLutFilePath(paths, project.luts, lutId, intensity, textFilesDir),
      khmerTextWindowsFor: (clip: Clip) => khmerWindowsByClipId.get(clip.id),
      ...(VCUT_HOSTED
        ? { videoEncoderArgs: ["-c:v", "libx264", "-preset", "medium", "-crf", String(project.exportSettings.crf), "-threads", "8"] }
        : null),
      ...(VCUT_HOSTED ? { keyframeSliceTuning: { baseIntervalSeconds: 1 / project.exportSettings.fps, maxSlices: 600 } } : null),
    });

    if (callbacks?.isCancelled?.()) throw new ApiError(499, "Export cancelled", "cancelled");

    callbacks?.onPhase?.("encoding");
    const run = runFfmpeg(plan.args, plan.duration, (fraction) => {
      callbacks?.onProgress?.(fraction);
    });

    callbacks?.onProcessSpawned?.(run.process, run.cancel);
    await run.done;

    if (callbacks?.isCancelled?.()) throw new ApiError(499, "Export cancelled", "cancelled");

    if (includeOutro) {
      callbacks?.onPhase?.("finalizing", "Adding outro…");
      try {
        await runOutroStep(project, textFilesDir, mainOutputPath, outputPath);
      } catch (err) {
        console.error("[vcut] export: outro step failed, shipping without it:", err);
        fs.copyFileSync(mainOutputPath, outputPath);
      }
    }

    const cover = project.exportSettings.cover;
    if (cover) {
      callbacks?.onPhase?.("finalizing", "Adding cover…");
      try {
        const coverAsset = cover.kind === "image" ? project.assets.find((a) => a.id === cover.assetId) : undefined;
        const coverImagePath =
          cover.kind === "frame"
            ? await extractCoverFrameJpeg(textFilesDir, outputPath, cover.time)
            : coverAsset
              ? resolveAssetInputPath(paths, libraryMediaDir, coverAsset)
              : null;
        if (coverImagePath) await runCoverArtStep(outputPath, coverImagePath);
      } catch (err) {
        console.error("[vcut] export: cover art step failed, shipping without it:", err);
      }
    }

    if (!VCUT_HOSTED && process.env.VCUT_EXPORTS_DIR) {
      const directory = process.env.VCUT_EXPORTS_DIR;
      await fs.promises.mkdir(directory, { recursive: true });
      const destination = path.join(directory, path.basename(outputPath));
      await fs.promises.copyFile(outputPath, destination, fs.constants.COPYFILE_EXCL);
    }

    callbacks?.onPhase?.("finalizing");
    callbacks?.onProgress?.(1.0);
    return { outputPath };
  } finally {
    fs.rmSync(textFilesDir, { recursive: true, force: true });
  }
}
