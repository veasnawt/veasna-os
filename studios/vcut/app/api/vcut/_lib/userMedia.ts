import fs from "fs";
import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import { listProjectsForOwner } from "./auth";
import type { Plan } from "./profiles";
import { ApiError, ensureProjectDirs, resolveWithin } from "./paths";

/** Real cost basis: Railway (this app's own host) charges $0.15/GB/month for persistent volume
 *  storage — confirmed against Railway's own published pricing, not assumed. Free's 1GB caps worst-
 *  case exposure at $0.15/month per user, the same order of magnitude `_lib/credits.ts`'s own
 *  `FREE_CREDITS_PER_MONTH` doc comment accepts for its own worst-case ($0.28/month). Pro's 10GB caps
 *  worst-case storage-specific exposure at $1.50/month against the $9.99/month subscription — priced
 *  as its OWN independent budget slice, not stacked additively on top of credits' own already-
 *  established ~$4/month worst-case ceiling: a real user maxing out BOTH every credit AND every byte
 *  of storage in the same month is the same low-probability tail every multi-entitlement subscription
 *  (this one's included, already, via credits alone) accepts as acceptable risk rather than designs
 *  the average case around. Change both together if Railway's own per-GB rate ever changes. */
export const STORAGE_CAP_BYTES: Record<Plan, number> = {
  free: 1 * 1024 * 1024 * 1024,
  pro: 10 * 1024 * 1024 * 1024,
};

export interface UserMediaRow {
  id: string;
  kind: "video" | "audio" | "image";
  name: string;
  relPath: string;
  thumbnailRelPath: string | null;
  filmstripRelPath: string | null;
  waveformRelPath: string | null;
  duration: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
  sizeBytes: number;
  aiGeneration: { prompt: string; aspectRatio: string; model?: string } | null;
  createdAt: string;
}

function rowFromDb(row: Record<string, unknown>): UserMediaRow {
  return {
    id: row.id as string,
    kind: row.kind as UserMediaRow["kind"],
    name: row.name as string,
    relPath: row.rel_path as string,
    thumbnailRelPath: (row.thumbnail_rel_path as string | null) ?? null,
    filmstripRelPath: (row.filmstrip_rel_path as string | null) ?? null,
    waveformRelPath: (row.waveform_rel_path as string | null) ?? null,
    duration: (row.duration as number) ?? 0,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    fps: (row.fps as number | null) ?? null,
    hasAudio: Boolean(row.has_audio),
    sizeBytes: Number(row.size_bytes) || 0,
    aiGeneration: (row.ai_generation as UserMediaRow["aiGeneration"]) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function listUserMedia(ownerId: string): Promise<UserMediaRow[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("user_media").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false });
  if (error) {
    console.error("[vcut] user_media: could not list media for", ownerId, error);
    throw new ApiError(500, "Could not list your media library", "user-media-list-failed");
  }
  return (data ?? []).map(rowFromDb);
}

export async function getOwnedUserMedia(id: string, ownerId: string): Promise<UserMediaRow> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("user_media").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("[vcut] user_media: could not read", id, error);
    throw new ApiError(500, "Could not read that media item", "user-media-read-failed");
  }
  if (!data || data.owner_id !== ownerId) throw new ApiError(403, "You don't have access to that media item", "forbidden");
  return rowFromDb(data);
}

/** Sums `size_bytes` across every row this user owns — computed fresh on demand rather than tracked
 *  as a running counter on `profiles` (the way `credits_remaining` is): a library realistically holds
 *  a few hundred rows at most per user, so a plain `SUM` costs nothing meaningful, and it can never
 *  drift the way an incrementally-updated counter could if an insert/delete and its counter update
 *  ever fell out of sync. */
export async function getStorageUsageBytes(ownerId: string): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("user_media").select("size_bytes").eq("owner_id", ownerId);
  if (error) {
    console.error("[vcut] user_media: could not compute storage usage for", ownerId, error);
    throw new ApiError(500, "Could not check your storage usage", "storage-usage-failed");
  }
  return (data ?? []).reduce((sum, row) => sum + (Number(row.size_bytes) || 0), 0);
}

/** Throws a 507-style (using 400, this app's own convention has no dedicated storage-full status)
 *  error unless `ownerId` has room for `additionalBytes` more under their plan's own cap — called
 *  BEFORE writing a new file to disk, the same "validate first, spend/write second" order every other
 *  gated action in this app already follows. */
export async function checkStorageQuota(ownerId: string, plan: Plan, additionalBytes: number): Promise<void> {
  const used = await getStorageUsageBytes(ownerId);
  const cap = STORAGE_CAP_BYTES[plan];
  if (used + additionalBytes > cap) {
    throw new ApiError(
      400,
      `This would put you over your ${Math.round(cap / (1024 * 1024 * 1024))}GB storage limit — delete something from your library first, or upgrade for more room.`,
      "storage-limit-exceeded"
    );
  }
}

export async function insertUserMedia(ownerId: string, row: Omit<UserMediaRow, "createdAt">): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("user_media").insert({
    id: row.id,
    owner_id: ownerId,
    kind: row.kind,
    name: row.name,
    rel_path: row.relPath,
    thumbnail_rel_path: row.thumbnailRelPath,
    filmstrip_rel_path: row.filmstripRelPath,
    waveform_rel_path: row.waveformRelPath,
    duration: row.duration,
    width: row.width,
    height: row.height,
    fps: row.fps,
    has_audio: row.hasAudio,
    size_bytes: row.sizeBytes,
    ai_generation: row.aiGeneration,
  });
  if (error) {
    console.error("[vcut] user_media: could not insert", row.id, error);
    throw new ApiError(500, "Could not save that to your media library", "user-media-insert-failed");
  }
}

/** How many of this user's OWN projects currently reference `mediaId`, and which ones — scanned live
 *  off each project's own project.json rather than tracked in a separate synced "usage" table: a
 *  user's own project count is small enough (tens, not thousands) that this costs nothing meaningful,
 *  and it can never drift the way a table kept in sync via add/remove events on every single save
 *  could. Tolerant of a project whose file is missing/corrupt (skipped, not fatal) — the same "one bad
 *  row shouldn't fail the whole check" precedent `captions/route.ts`'s own per-clip tolerance already
 *  sets. */
export async function findProjectsUsingMedia(ownerId: string, mediaId: string): Promise<{ id: string; name: string }[]> {
  const projects = await listProjectsForOwner(ownerId);
  const using: { id: string; name: string }[] = [];
  for (const p of projects) {
    try {
      const paths = ensureProjectDirs(p.id);
      if (!fs.existsSync(paths.projectFile)) continue;
      const project = deserializeProject(fs.readFileSync(paths.projectFile, "utf8"));
      if (project.assets.some((a) => a.libraryMediaId === mediaId)) using.push({ id: p.id, name: p.name });
    } catch {
      // A project file that doesn't even parse can't meaningfully answer "does it use this asset" —
      // skipped rather than failing the whole check over one unrelated project's own corruption.
    }
  }
  return using;
}

/** Deletes a library row AND its real files — the caller (the route) is what actually decides
 *  whether to proceed after warning about `findProjectsUsingMedia`'s own results; this function
 *  itself doesn't re-check usage, so a caller that already showed the warning and got confirmation
 *  isn't forced through a second, redundant scan. */
export async function deleteUserMedia(id: string, ownerId: string, mediaDir: string, thumbnailsDir: string): Promise<void> {
  const row = await getOwnedUserMedia(id, ownerId);
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("user_media").delete().eq("id", id).eq("owner_id", ownerId);
  if (error) {
    console.error("[vcut] user_media: could not delete", id, error);
    throw new ApiError(500, "Could not delete that media item", "user-media-delete-failed");
  }
  // Best-effort file cleanup, after the DB row is confirmed gone — a leftover orphan file on disk is
  // recoverable disk-space waste; a DB row pointing at a file that's already gone is a worse, user-
  // visible "broken asset" failure mode. Never blocks the delete response on this succeeding.
  // `resolveWithin` keeps this consistent with every other path resolution in the app even though
  // `relPath` here comes from OUR OWN just-deleted row, not raw request input.
  const toRemove: [string, string | null][] = [
    [mediaDir, row.relPath],
    [thumbnailsDir, row.thumbnailRelPath],
    [thumbnailsDir, row.filmstripRelPath],
    [thumbnailsDir, row.waveformRelPath],
  ];
  for (const [dir, relPath] of toRemove) {
    if (!relPath) continue;
    try {
      fs.rm(resolveWithin(dir, relPath), { force: true }, () => {});
    } catch {
      // Malformed stored path — nothing safe to remove, and not worth failing the delete over.
    }
  }
}
