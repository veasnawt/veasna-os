import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import type { TemplateProjectData } from "@veasnawt/vcut/src/project/template";
import { ApiError } from "./paths";
import { getProfile } from "./profiles";

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
