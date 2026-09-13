import fs from "fs";
import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import type { Asset } from "@veasnawt/vcut/src/project/types";
import type { TemplateProjectData } from "@veasnawt/vcut/src/project/template";
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
      const fresh = await importMediaBytes(libraryPaths, bytes, asset.name);
      if (fresh.kind !== "audio") throw new ApiError(500, "Unexpected asset kind from template audio", "unexpected-asset-kind");
      await insertUserMedia(newOwnerId, {
        id: fresh.id,
        kind: fresh.kind,
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
