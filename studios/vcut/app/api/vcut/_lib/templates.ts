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
 *  Resolves the real source file via the SAME shared `resolveAssetInputPath` export/route.ts and
 *  `renderTemplatePreview` above already use — not its own separate copy of that logic, which is
 *  exactly what caused a real, reported `ENOENT` here: this function's own resolution used to check
 *  ONLY `asset.libraryMediaId` (the account-wide library case), predating `Asset.bundledSfx` (the
 *  zero-copy bundled SFX catalog, added later) entirely — a bundled-catalog sound effect placed on the
 *  timeline is neither project-local nor library-backed, so the old two-way check fell through to
 *  "this project's own mediaDir" for a file that was never copied there at all, the moment someone
 *  saved a template containing one. Three storage locations now (project-local, library, bundled
 *  catalog) is exactly the kind of drift a SHARED resolver exists to prevent — see that function's own
 *  doc comment. */
export async function bundleTemplateAudio(
  templateId: string,
  ownerId: string,
  sourceProjectPaths: ProjectPaths,
  assets: Asset[]
): Promise<Asset[]> {
  const audioDirs = ensureTemplateAudioDirs(templateId);
  const libraryMediaDir = userMediaPaths(ownerId).mediaDir;
  return Promise.all(
    assets.map(async (asset) => {
      if (!asset.templateBundledAudio) return asset;
      const bytes = fs.readFileSync(resolveAssetInputPath(sourceProjectPaths, libraryMediaDir, asset));
      // `importMediaBytes` needs its `suggestedName` param to carry a REAL extension — it's the only
      // thing that tells it what kind of file this even is (see that function's own doc comment). A
      // normal imported audio asset's `name` already is a real filename ("song.mp3"), but a bundled
      // catalog SFX's `name` is deliberately just its human-readable label ("Error Glitch", no
      // extension — see `assetFromBundledSfx`'s own doc comment), which made THIS call throw "VCut
      // can't import 'Error Glitch'" the moment the earlier ENOENT fix let it get this far. Falls back
      // to stitching the real extension off `relPath` on ONLY when `name` doesn't already have one of
      // its own, so an ordinary asset's behavior here is completely unchanged.
      const suggestedName = path.extname(asset.name) ? asset.name : `${asset.name}${path.extname(asset.relPath)}`;
      const fresh = await importMediaBytes(audioDirs, bytes, suggestedName);
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
  isPublic: boolean;
  /** Phase 3's own creator attribution needs this on every row — Discover tiles and the viewer's action
   *  rail both look up the owner's `PublicProfile` (`getPublicProfiles`) by it. Present on "My Templates"
   *  rows too (always the caller's own id there) for a uniform shape, even though those callers never
   *  need to look anything up for it. */
  ownerId: string;
}

/** Every template a user owns, newest-edited first — same ordering `listProjectsForOwner` already
 *  gives for projects, via the same `(owner_id, updated_at desc)` index the migration adds. Includes
 *  BOTH private and public templates — "My Templates" is every one of your own regardless of
 *  visibility; `listPublicTemplates` below is the separate "Discover" feed. */
export async function listTemplatesForOwner(ownerId: string): Promise<TemplateRow[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, project, updated_at, is_public, owner_id")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  if (error) throw new ApiError(500, "Could not list templates", "templates-list-failed");
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    project: row.project as TemplateProjectData,
    updatedAt: row.updated_at,
    isPublic: row.is_public,
    ownerId: row.owner_id,
  }));
}

/** Every PUBLICLY published template, EXCLUDING the viewer's own (their own public templates already
 *  show in "My Templates" — mixing them into "Discover" too would mean seeing your own content while
 *  browsing what other people made, the same convention most real discovery feeds already follow),
 *  newest-published first (`published_at`, not `updated_at` — see that column's own migration comment
 *  for why the two need to differ). No pagination yet — capped at a flat `limit`; worth revisiting once
 *  real usage makes a flat cap actually matter. */
export async function listPublicTemplates(viewerId: string, limit = 60): Promise<TemplateRow[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, project, updated_at, is_public, owner_id")
    .eq("is_public", true)
    .neq("owner_id", viewerId)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new ApiError(500, "Could not list public templates", "templates-discover-failed");
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    project: row.project as TemplateProjectData,
    updatedAt: row.updated_at,
    isPublic: row.is_public,
    ownerId: row.owner_id,
  }));
}

/** Every PUBLIC template belonging to one specific creator, newest-published first — `/u/[id]`'s own
 *  creator page (Phase 3), reachable by tapping a name in Discover or the viewer's action rail. Never
 *  includes a private template, regardless of who's asking (even the creator themselves viewing their
 *  own `/u/[id]` page sees exactly what anyone else would) — this is the PUBLIC-facing grid, "My
 *  Templates" already covers the owner's own full view including private ones. */
export async function listPublicTemplatesByOwner(ownerId: string, limit = 60): Promise<TemplateRow[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, project, updated_at, is_public, owner_id")
    .eq("owner_id", ownerId)
    .eq("is_public", true)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new ApiError(500, "Could not list that creator's templates", "templates-creator-failed");
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    project: row.project as TemplateProjectData,
    updatedAt: row.updated_at,
    isPublic: row.is_public,
    ownerId: row.owner_id,
  }));
}

/** Throws unless `ownerId` actually owns `templateId` — same "doesn't exist" and "exists but belongs
 *  to someone else" collapsed into one 403 that `checkProjectOwnership` already gives for projects,
 *  so a prober can't tell the two apart by response. Strict owner-only — used where that's genuinely
 *  required (the publish/unpublish toggle below): see `getViewableTemplate` for the looser
 *  owner-OR-public check reading a template's own preview/using it as a new project's starting point
 *  need instead. */
export async function getOwnedTemplate(templateId: string, ownerId: string): Promise<TemplateProjectData> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("templates").select("owner_id, project").eq("id", templateId).maybeSingle();
  if (error) throw new ApiError(500, "Could not read that template", "template-read-failed");
  if (!data || data.owner_id !== ownerId) throw new ApiError(403, "You don't have access to that template", "forbidden");
  return data.project as TemplateProjectData;
}

export interface ViewableTemplate {
  ownerId: string;
  isPublic: boolean;
  name: string;
  project: TemplateProjectData;
}

/** Looser than `getOwnedTemplate` — allows either the OWNER or ANY signed-in viewer when the template
 *  is public (`is_public`, see that column's own migration comment: Phase 2's opt-in sharing). Returns
 *  `ownerId`/`isPublic` alongside the project data so callers can layer their OWN Pro-gating on top —
 *  `templates/[id]/preview/route.ts` and `project/route.ts`'s create-from-template flow both only
 *  require Pro of the OWNER, per the deliberate "Free can browse/use a published template; only
 *  publishing your own stays Pro-only" product decision. This function itself has no opinion on Pro at
 *  all, the same authorization-vs-entitlement split `checkProjectOwnership` already keeps for
 *  projects. Same "doesn't exist" / "exists but neither yours nor public" 403 collapse `getOwnedTemplate`
 *  already uses. */
export async function getViewableTemplate(templateId: string, viewerId: string): Promise<ViewableTemplate> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("templates").select("owner_id, is_public, name, project").eq("id", templateId).maybeSingle();
  if (error) throw new ApiError(500, "Could not read that template", "template-read-failed");
  if (!data || (data.owner_id !== viewerId && !data.is_public)) {
    throw new ApiError(403, "You don't have access to that template", "forbidden");
  }
  return { ownerId: data.owner_id, isPublic: data.is_public, name: data.name, project: data.project as TemplateProjectData };
}

/** Toggles a template's own public-visibility flag — owner-only, scoped in the query itself (matching
 *  `deleteOwnedTemplate`'s own "don't leak which ids are real" reasoning: a mismatched owner_id just
 *  matches zero rows rather than a distinguishable 403, surfaced here as the same generic 403 either
 *  way). Sets `published_at` the moment `isPublic` first flips true; left untouched on an unpublish
 *  (see the migration's own comment on that column for why). */
export async function setTemplatePublic(templateId: string, ownerId: string, isPublic: boolean): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const update: Record<string, unknown> = { is_public: isPublic };
  if (isPublic) update.published_at = new Date().toISOString();
  const { data, error } = await supabase.from("templates").update(update).eq("id", templateId).eq("owner_id", ownerId).select("id");
  if (error) throw new ApiError(500, "Could not update that template", "template-update-failed");
  if (!data || data.length === 0) throw new ApiError(403, "You don't have access to that template", "forbidden");
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
