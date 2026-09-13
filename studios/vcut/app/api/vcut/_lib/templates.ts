import fs from "fs";
import os from "os";
import path from "path";
import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import { buildExportPlan } from "@veasnawt/vcut/src/export/buildExportPlan";
import { trimProjectToRange } from "@veasnawt/vcut/src/export/trimForExport";
import { sequenceDuration } from "@veasnawt/vcut/src/project/createProject";
import type { Asset, Project } from "@veasnawt/vcut/src/project/types";
import type { TemplateProjectData } from "@veasnawt/vcut/src/project/template";
import { resolveAssetInputPath } from "./assetInput";
import { fontMetricsFor, fontsDirPath, runFfmpeg, textFontPath } from "./ffmpeg";
import { importMediaBytes } from "./importMedia";
import { ApiError, ensureTemplateAudioDirs, ensureUserMediaDirs, resolveWithin, userMediaPaths } from "./paths";
import type { ProjectPaths } from "./paths";
import { getProfile } from "./profiles";
import { checkStorageQuota, insertUserMedia } from "./userMedia";

/** Pro users only, end to end — creating, listing, using, and deleting a template all gate on this
 *  the same way (see the migration's own doc comment for why a template is user-owned/mutable like a
 *  project rather than admin-only): there's no free-tier version of this feature to fall back to, so
 *  every route below calls this FIRST and throws rather than degrading behavior the way
 *  `shouldIncludeOutro` (export/route.ts) does for its own, softer Pro check. */
export async function requirePro(userId: string): Promise<void> {
  const profile = await getProfile(userId);
  if (profile?.plan !== "pro") {
    throw new ApiError(402, "Templates are a Pro feature — upgrade to save or use one", "pro-required");
  }
}

/** Copies the real audio file behind every `Asset.templateBundledAudio` entry `sanitizeProjectForTemplate`
 *  left pointing at its ORIGINAL location (unchanged `relPath`, by design — see that function's own doc
 *  comment) into this template's own permanent storage (`templateAudioPaths`), and returns the
 *  sanitized asset list with each of those entries replaced by the fresh, real asset `importMediaBytes`
 *  produces there — same probing/thumbnail/waveform pipeline any other import goes through, so the
 *  bundled copy is a fully-formed asset, not a bare file. Called once, right after
 *  `sanitizeProjectForTemplate`, from `templates/route.ts`'s own POST handler.
 *
 *  `asset.libraryMediaId` set means the real file actually lives in the OWNER's own account-wide
 *  library (`users/<ownerId>/media`, via `media/route.ts`'s own hosted-mode upload path — see
 *  `Asset.libraryMediaId`'s own doc comment), not this project's own `mediaDir` — a real, reported bug
 *  otherwise: a bundled SFX/music clip placed on the timeline goes through the exact same account-wide
 *  import path as any other upload, so treating every bundled-audio asset as project-local threw a
 *  plain "no such file" the moment someone tried to save a template containing one. Any OTHER asset (a
 *  placeholder, or text/color) passes through unchanged either way. */
export async function bundleTemplateAudio(
  templateId: string,
  ownerId: string,
  sourceProjectPaths: ProjectPaths,
  assets: Asset[]
): Promise<Asset[]> {
  const audioDirs = ensureTemplateAudioDirs(templateId);
  return Promise.all(
    assets.map(async (asset) => {
      if (!asset.templateBundledAudio) return asset;
      const sourceDir = asset.libraryMediaId ? userMediaPaths(ownerId).mediaDir : sourceProjectPaths.mediaDir;
      const bytes = fs.readFileSync(resolveWithin(sourceDir, asset.relPath));
      const fresh = await importMediaBytes(audioDirs, bytes, asset.name);
      return { ...fresh, id: asset.id, templateBundledAudio: true as const };
    })
  );
}

/** Cap on a template's own preview clip — short enough to feel like a Reels/TikTok-style loop, not a
 *  full watch-through. */
const TEMPLATE_PREVIEW_MAX_SECONDS = 6;
/** The long side of the preview's own output resolution, and its compression settings — deliberately
 *  small: unlike a real export (a one-off file the user downloads and the app can forget about), this
 *  file is kept FOREVER once a template is saved — nothing currently expires old template data — so
 *  its per-template size directly adds to the same shared Railway volume that has already run out of
 *  room once this session. A real export's own quality settings would be wildly disproportionate for
 *  what's just a decorative preview thumbnail. */
const TEMPLATE_PREVIEW_MAX_DIMENSION = 540;
const TEMPLATE_PREVIEW_CRF = 30;
const TEMPLATE_PREVIEW_AUDIO_KBPS = 96;

/** Renders a short, low-bitrate preview clip from a template's ORIGINAL (pre-sanitize) project — the
 *  Templates tab's own Pinterest-grid poster frame and full-screen autoplay video. Has to run on the
 *  REAL project, before `sanitizeProjectForTemplate` strips every video/image clip down to a bare
 *  placeholder — a placeholder has no real pixels left to render at all (see that function's own doc
 *  comment) — so this is the only point in the whole save flow where a real preview is still possible.
 *  `templates/route.ts`'s own POST handler calls this BEFORE sanitizing, for exactly that reason.
 *
 *  Written to `templates/<templateId>/preview.mp4` — a fixed filename, sibling of `bundleTemplateAudio`'s
 *  own `media`/`thumbnails` subdirectories (`ensureTemplateAudioDirs`'s `dir`), not a growing collection,
 *  since a template only ever has exactly one current preview.
 *
 *  Best-effort, never fatal: a template still saves successfully even if the preview render fails
 *  (missing ffmpeg, an unreadable source file, an empty timeline) — same "a missing thumbnail costs a
 *  flat-color clip, not a failed import" tolerance `generateThumbnail`/`generateWaveform` already
 *  established elsewhere in this codebase; the Templates tab just shows a generic placeholder tile for
 *  a template with no preview file on disk. `khmerTextWindowsFor` is unconditionally omitted — no
 *  Khmer render-harness invocation for a background, decorative preview; a Khmer text clip just
 *  renders through `buildExportPlan`'s own ordinary (non-Khmer-shaped) `drawtext` path instead, an
 *  acceptable fidelity cut for a throwaway preview. */
export async function renderTemplatePreview(
  templateId: string,
  project: Project,
  paths: ProjectPaths,
  libraryMediaDir: string | null
): Promise<void> {
  try {
    const fullDuration = sequenceDuration(project);
    if (fullDuration <= 0) return;
    const previewProject = trimProjectToRange(project, 0, Math.min(fullDuration, TEMPLATE_PREVIEW_MAX_SECONDS));

    const { width, height } = previewProject.sequence;
    const scale = Math.min(1, TEMPLATE_PREVIEW_MAX_DIMENSION / Math.max(width, height));
    previewProject.exportSettings = {
      ...previewProject.exportSettings,
      // Even dimensions — libx264 rejects an odd width/height outright.
      width: Math.max(2, Math.round((width * scale) / 2) * 2),
      height: Math.max(2, Math.round((height * scale) / 2) * 2),
      fps: Math.min(previewProject.exportSettings.fps, 30),
      crf: TEMPLATE_PREVIEW_CRF,
      audioBitrateKbps: TEMPLATE_PREVIEW_AUDIO_KBPS,
    };

    const outputPath = path.join(ensureTemplateAudioDirs(templateId).dir, "preview.mp4");
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "vcut-template-preview-"));
    try {
      const plan = buildExportPlan(previewProject, {
        inputPathFor: (assetId) => {
          const asset = previewProject.assets.find((a) => a.id === assetId);
          if (!asset) throw new Error(`Clip references missing asset ${assetId}`);
          return resolveAssetInputPath(paths, libraryMediaDir, asset);
        },
        outputPath,
        fontPathFor: (fileName) => textFontPath(fileName),
        textFilePathFor: (clip, content, variant) => {
          const filePath = path.join(scratchDir, `${clip.id}${variant ? `-${variant}` : ""}.txt`);
          fs.writeFileSync(filePath, content, "utf8");
          return filePath;
        },
        assFilePathFor: (clip, assContent) => {
          const filePath = path.join(scratchDir, `${clip.id}.ass`);
          fs.writeFileSync(filePath, assContent, "utf8");
          return filePath;
        },
        fontMetricsFor,
        fontsDirFor: fontsDirPath,
        lutPathFor: (lutId) => {
          const lut = previewProject.luts.find((l) => l.id === lutId);
          return lut ? resolveWithin(paths.lutsDir, lut.relPath) : undefined;
        },
      });
      await runFfmpeg(plan.args, plan.duration, () => {}).done;
    } finally {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error("[vcut] templates: preview render failed for", templateId, err);
  }
}

/** The reverse of `bundleTemplateAudio` — copies each `Asset.templateBundledAudio` entry
 *  `buildProjectFromTemplate` left pointing at the TEMPLATE's own bundled-audio storage into the NEW
 *  owner's own account-wide library (same `checkStorageQuota`/`insertUserMedia`/`ensureUserMediaDirs`
 *  path every other hosted-mode import goes through — `media/route.ts`'s own upload handler included —
 *  rather than a plain project-local file), replacing it with a completely normal, real, library-backed
 *  asset (`templateBundledAudio` gone entirely — by the time anything else sees it, it's
 *  indistinguishable from any other imported audio file, per that field's own doc comment). Landing it
 *  in the library, not just the project, is what makes it show up in "All my media" and count against
 *  the new owner's own storage quota like everything else they own — the same consistency
 *  `Asset.libraryMediaId`'s own doc comment already establishes for every other asset kind. Called
 *  once, right after `buildProjectFromTemplate`, from `project/route.ts`'s own POST handler. */
export async function resolveTemplateBundledAudio(templateId: string, newOwnerId: string, assets: Asset[]): Promise<Asset[]> {
  const audioDirs = ensureTemplateAudioDirs(templateId);
  const profile = await getProfile(newOwnerId);
  return Promise.all(
    assets.map(async (asset) => {
      if (!asset.templateBundledAudio) return asset;
      const bytes = fs.readFileSync(resolveWithin(audioDirs.mediaDir, asset.relPath));
      await checkStorageQuota(newOwnerId, profile?.plan ?? "free", bytes.byteLength);
      const libraryPaths = ensureUserMediaDirs(newOwnerId);
      const imported = await importMediaBytes(libraryPaths, bytes, asset.name);
      if (imported.kind !== "audio") throw new ApiError(500, "Unexpected asset kind from template audio", "unexpected-asset-kind");
      // `id: asset.id` — NOT `imported`'s own freshly-minted one. A real, reported bug otherwise: the
      // audio CLIP (built by `buildProjectFromTemplate`, already returned before this function ever
      // runs) already references `asset.id` — silently keeping `importMediaBytes`'s own different id
      // instead left that clip pointing at an asset that no longer existed in `project.assets` at all,
      // so the resulting project's preview/export both played with no audio whatsoever.
      const fresh: Asset = { ...imported, id: asset.id };
      await insertUserMedia(newOwnerId, {
        id: fresh.id,
        kind: fresh.kind as "video" | "audio" | "image",
        name: fresh.name,
        relPath: fresh.relPath,
        thumbnailRelPath: fresh.thumbnailRelPath ?? null,
        filmstripRelPath: fresh.filmstripRelPath ?? null,
        waveformRelPath: fresh.waveformRelPath ?? null,
        duration: fresh.duration,
        width: fresh.width ?? null,
        height: fresh.height ?? null,
        fps: fresh.fps ?? null,
        hasAudio: fresh.hasAudio,
        sizeBytes: fresh.sizeBytes,
        aiGeneration: null,
        // Deliberately visible in "All my media" — see this function's own doc comment: landing it in
        // the library at all (not just the project) is what makes it count as something the new owner
        // genuinely owns, the same as any other library item.
        hidden: false,
      });
      fresh.libraryMediaId = fresh.id;
      return fresh;
    })
  );
}

export interface TemplateRow {
  id: string;
  name: string;
  project: TemplateProjectData;
  updatedAt: string;
}

/** Every template a user owns, newest-edited first — same ordering `listProjectsForOwner` already
 *  gives for projects, via the same `(owner_id, updated_at desc)` index the migration adds. */
export async function listTemplatesForOwner(ownerId: string): Promise<TemplateRow[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, project, updated_at")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  if (error) throw new ApiError(500, "Could not list templates", "templates-list-failed");
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, project: row.project as TemplateProjectData, updatedAt: row.updated_at }));
}

/** Throws unless `ownerId` actually owns `templateId` — same "doesn't exist" and "exists but belongs
 *  to someone else" collapsed into one 403 that `checkProjectOwnership` already gives for projects,
 *  so a prober can't tell the two apart by response. */
export async function getOwnedTemplate(templateId: string, ownerId: string): Promise<TemplateProjectData> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("templates").select("owner_id, project").eq("id", templateId).maybeSingle();
  if (error) throw new ApiError(500, "Could not read that template", "template-read-failed");
  if (!data || data.owner_id !== ownerId) throw new ApiError(403, "You don't have access to that template", "forbidden");
  return data.project as TemplateProjectData;
}

export async function insertTemplate(id: string, ownerId: string, name: string, project: TemplateProjectData): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("templates").insert({ id, owner_id: ownerId, name, project });
  if (error) throw new ApiError(500, "Could not save that template", "template-save-failed");
}

/** Ownership-scoped in the query itself (not a separate `getOwnedTemplate` check first) — a delete
 *  that matches zero rows because the id belongs to someone else is indistinguishable, from the
 *  caller's side, from one that matched zero rows because the id never existed at all; either way
 *  nothing happens, which is the same "don't leak which ids are real" posture `checkProjectOwnership`
 *  takes deliberately, just enforced by the query's own `eq` filters instead of a thrown 403. */
export async function deleteOwnedTemplate(templateId: string, ownerId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("templates").delete().eq("id", templateId).eq("owner_id", ownerId);
  if (error) throw new ApiError(500, "Could not delete that template", "template-delete-failed");
}
