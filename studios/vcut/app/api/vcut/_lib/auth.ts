import { getSessionUser, getSupabaseAdminClient, type SessionUser } from "@veasnawt/auth/server";
import { ApiError } from "./paths";

/** Set only in the public web deployment (Railway) — unset for desktop's bundled server and local dev,
 *  where `localOnly.ts`'s IP-based guard is the whole story, exactly as it's always been. Every other
 *  function in this file is meaningless (and never called) when this is false. */
export const VCUT_HOSTED = process.env.VCUT_HOSTED === "true";

/** Pulls the bearer token off a request and verifies it against Supabase, throwing a real 401 (not
 *  the old local-only 403 — a signed-out visitor in hosted mode is a normal case a client should
 *  handle by prompting sign-in, not the "you should never be able to reach this at all" case the
 *  local-only guard exists for) if there isn't a valid session.
 *
 *  Falls back to a `?token=` query param when there's no `Authorization` header — needed because
 *  `media/raw/route.ts`'s URLs (built by `packages/vcut/src/api/client.ts`'s `mediaUrl` and its
 *  wrappers: `thumbnailUrl`, `filmstripUrl`, `waveformUrl`, `lutUrl`, `customSfxUrl`) get handed
 *  straight to `<video src>`/`<img src>`/`<audio src>` — plain browser resource loads that cannot
 *  attach a custom header the way `apiFetch`'s JSON calls can. Confirmed as a real production gap,
 *  not a theoretical one: every clip/thumbnail/waveform 401'd on the actual vcut.io deploy until this
 *  fallback existed. Every OTHER hosted route is always called through `apiFetch`, which already sets
 *  the header — this fallback costs them nothing, it's just an additional accepted credential source
 *  that happens to only matter for the one route that actually needs it. */
export async function requireSessionUser(req: Request): Promise<SessionUser> {
  const header = req.headers.get("authorization") ?? "";
  let token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) token = new URL(req.url).searchParams.get("token") ?? "";
  const user = token ? await getSessionUser(token) : null;
  if (!user) throw new ApiError(401, "Sign in required", "unauthorized");
  return user;
}

/** Row shape of the `projects_index` table — see the Supabase migration this mirrors. Exists purely
 *  so `GET /api/vcut/projects` can answer "which projects does this user own" without scanning and
 *  parsing every `project.json` on disk (today's local/desktop approach, still used unchanged there —
 *  see that route's own `VCUT_HOSTED` branch), which in hosted mode would mean reading every OTHER
 *  tenant's files just to filter them back out. */
export interface ProjectIndexRow {
  id: string;
  owner_id: string;
  name: string;
  updated_at: string;
}

/** Throws a 403 unless `userId` owns `projectId` — the ownership half of the hosted-mode gate. A
 *  project id that doesn't exist in the index at all (never created in hosted mode, or already
 *  deleted) is treated the same as "exists but belongs to someone else": both are "you don't get to
 *  touch this", and distinguishing them would only tell a prober which project ids are real. */
export async function checkProjectOwnership(userId: string, projectId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("projects_index").select("owner_id").eq("id", projectId).maybeSingle();
  if (error) throw new ApiError(500, "Could not verify project access", "ownership-check-failed");
  if (!data || data.owner_id !== userId) throw new ApiError(403, "You don't have access to this project", "forbidden");
}

/** Called once, from `project/route.ts`'s `POST`, right after a new project is created — the only
 *  place a row is ever INSERTED (as opposed to updated) in hosted mode, since project creation is the
 *  one moment an `ownerId` gets decided at all. Also called on every save to keep `name`/`updated_at`
 *  current for the project list — an `upsert` rather than separate insert/update paths, since "does
 *  this row already exist" isn't something the caller needs to track itself. */
export async function upsertProjectIndex(id: string, ownerId: string, name: string, updatedAt: number): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("projects_index")
    .upsert({ id, owner_id: ownerId, name, updated_at: new Date(updatedAt).toISOString() });
  if (error) throw new ApiError(500, "Could not save project index", "index-write-failed");
}

/** Called from `project/route.ts`'s `DELETE` — without this, a deleted project leaves a phantom row
 *  `GET /api/vcut/projects` would keep listing forever, pointing at a folder that no longer exists. */
export async function deleteProjectIndex(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  await supabase.from("projects_index").delete().eq("id", id);
}

/** Every project a user owns, newest-edited first — same ordering `projects/route.ts`'s existing
 *  local/desktop directory scan already uses, so the hosted branch reads identically to a caller. */
export async function listProjectsForOwner(ownerId: string): Promise<ProjectIndexRow[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("projects_index")
    .select("id,owner_id,name,updated_at")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  if (error) throw new ApiError(500, "Could not list projects", "index-list-failed");
  return data ?? [];
}
