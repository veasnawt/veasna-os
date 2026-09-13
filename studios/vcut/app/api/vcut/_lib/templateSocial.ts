import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import { ApiError } from "./paths";
import { getPublicProfiles } from "./profiles";

/** Phase 3's real Like/Comment, layered on top of Phase 2's public-template plumbing
 *  (`getViewableTemplate`, `is_public`) rather than duplicating its own visibility checks — every
 *  function here assumes ITS CALLER already confirmed the template is one this viewer may see (public,
 *  or their own); a route wires that together, this file only ever talks to `template_likes`/
 *  `template_comments` themselves. Both tables (see migration 0010) carry their own RLS as
 *  defense-in-depth, but — same posture as every other table in this app — the real enforcement is
 *  here, in the service-role-backed route handlers, not the policies. */

/** One row per (template, user) who liked it — batch-counted the same way `getPublicProfiles` batches
 *  display-name lookups: a Discover grid of dozens of tiles needs dozens of counts in one request, not
 *  one round trip each. */
export async function getLikeCounts(templateIds: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(templateIds)];
  const counts = new Map<string, number>();
  if (unique.length === 0) return counts;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("template_likes").select("template_id").in("template_id", unique);
  if (error) {
    console.error("[vcut] templateSocial: could not batch-read like counts for", unique, error);
    return counts;
  }
  for (const row of data ?? []) counts.set(row.template_id, (counts.get(row.template_id) ?? 0) + 1);
  return counts;
}

/** Which of `templateIds` this ONE viewer has already liked — a single `.in()` query, not one per tile,
 *  same batching reasoning as `getLikeCounts`. `null` viewer (an anonymous visitor on the public
 *  `/t/[id]` page) always returns an empty set — there's no session to have liked anything as. */
export async function getLikedSet(templateIds: string[], viewerId: string | null): Promise<Set<string>> {
  const liked = new Set<string>();
  const unique = [...new Set(templateIds)];
  if (!viewerId || unique.length === 0) return liked;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("template_likes")
    .select("template_id")
    .eq("user_id", viewerId)
    .in("template_id", unique);
  if (error) {
    console.error("[vcut] templateSocial: could not read liked set for", viewerId, error);
    return liked;
  }
  for (const row of data ?? []) liked.add(row.template_id);
  return liked;
}

/** Idempotent — liking something you've already liked is a no-op, not a duplicate-row error, since
 *  `(template_id, user_id)` is the table's own primary key (see the migration's own doc comment). */
export async function likeTemplate(templateId: string, userId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("template_likes")
    .upsert({ template_id: templateId, user_id: userId }, { onConflict: "template_id,user_id" });
  if (error) throw new ApiError(500, "Could not like that template", "template-like-failed");
}

export async function unlikeTemplate(templateId: string, userId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("template_likes").delete().eq("template_id", templateId).eq("user_id", userId);
  if (error) throw new ApiError(500, "Could not remove your like", "template-unlike-failed");
}

/** The "Likes" stat on `/u/[id]`'s own profile header -- the sum of likes across every template this
 *  creator has PUBLISHED (never a private one, even for the creator's own view of their own page --
 *  same "the public-facing profile shows exactly what anyone else would see" rule `listPublicTemplatesByOwner`
 *  already follows). Two queries (their own template ids, then a count of likes against those) rather
 *  than a single joined one -- `template_likes`/`templates` have no FK relationship PostgREST could
 *  embed across, same reasoning `listComments`'s own doc comment already gives for not embedding there
 *  either. */
export async function getTotalLikesForOwner(ownerId: string): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data: templateRows, error: templatesError } = await supabase
    .from("templates")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("is_public", true);
  if (templatesError) {
    console.error("[vcut] templateSocial: could not list templates for total-likes", ownerId, templatesError);
    return 0;
  }
  const ids = (templateRows ?? []).map((r) => r.id);
  if (ids.length === 0) return 0;
  const { count, error } = await supabase
    .from("template_likes")
    .select("*", { count: "exact", head: true })
    .in("template_id", ids);
  if (error) {
    console.error("[vcut] templateSocial: could not count total likes for", ownerId, error);
    return 0;
  }
  return count ?? 0;
}

/** The "Liked content" tab on `/u/[id]` -- every PUBLIC template this creator has liked, newest-liked
 *  first. Never a private one (this creator liking their own unpublished draft, or a template that's
 *  since been unpublished or deleted) -- a like on something nobody else can see would leak the
 *  existence of content that isn't meant to be visible at all. Two plain queries (this liker's own
 *  liked ids, newest first, then which of those are still public templates) rather than an embedded
 *  PostgREST join -- same "no declared cross-table relationship to lean on" caution `listComments`'s
 *  own doc comment already takes, kept simple and easy to reason about over a nested-filter join this
 *  file has no other precedent for. */
export async function listLikedPublicTemplates(likerUserId: string, limit = 60): Promise<string[]> {
  const supabase = getSupabaseAdminClient();
  const { data: likedRows, error: likedError } = await supabase
    .from("template_likes")
    .select("template_id")
    .eq("user_id", likerUserId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (likedError) {
    console.error("[vcut] templateSocial: could not list liked template ids for", likerUserId, likedError);
    return [];
  }
  const orderedIds = (likedRows ?? []).map((r) => r.template_id);
  if (orderedIds.length === 0) return [];
  const { data: publicRows, error: publicError } = await supabase
    .from("templates")
    .select("id")
    .in("id", orderedIds)
    .eq("is_public", true);
  if (publicError) {
    console.error("[vcut] templateSocial: could not filter liked templates to public for", likerUserId, publicError);
    return [];
  }
  const stillPublic = new Set((publicRows ?? []).map((r) => r.id));
  return orderedIds.filter((id) => stillPublic.has(id));
}

export interface CommentRow {
  id: string;
  templateId: string;
  userId: string;
  authorDisplayName: string | null;
  body: string;
  createdAt: string;
}

export async function getCommentCounts(templateIds: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(templateIds)];
  const counts = new Map<string, number>();
  if (unique.length === 0) return counts;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("template_comments").select("template_id").in("template_id", unique);
  if (error) {
    console.error("[vcut] templateSocial: could not batch-read comment counts for", unique, error);
    return counts;
  }
  for (const row of data ?? []) counts.set(row.template_id, (counts.get(row.template_id) ?? 0) + 1);
  return counts;
}

/** Oldest first — a comment thread reads top-to-bottom like a conversation, not newest-first like a
 *  feed. Batches every commenter's display name in one extra query (`getPublicProfiles`) rather than
 *  embedding a Postgres join — `profiles` and `template_comments` have no FK Supabase's PostgREST could
 *  embed across without an explicit relationship being declared, and this is simple enough not to need
 *  one. */
export async function listComments(templateId: string, limit = 200): Promise<CommentRow[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("template_comments")
    .select("id, template_id, user_id, body, created_at")
    .eq("template_id", templateId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new ApiError(500, "Could not load comments", "template-comments-list-failed");
  const rows = data ?? [];
  const profiles = await getPublicProfiles(rows.map((r) => r.user_id));
  return rows.map((row) => ({
    id: row.id,
    templateId: row.template_id,
    userId: row.user_id,
    authorDisplayName: profiles.get(row.user_id)?.displayName ?? null,
    body: row.body,
    createdAt: row.created_at,
  }));
}

/** `id` is client-minted (`crypto.randomUUID()`, same convention `template_comments.id`'s own migration
 *  comment documents) rather than DB-generated — the route handler mints it before calling this, the
 *  same pattern `insertTemplate`'s own caller already follows for a template's own id. */
export async function addComment(id: string, templateId: string, userId: string, body: string): Promise<CommentRow> {
  const trimmed = body.trim().slice(0, 1000);
  if (!trimmed) throw new ApiError(400, "Comment can't be empty", "empty-comment");
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("template_comments").insert({ id, template_id: templateId, user_id: userId, body: trimmed });
  if (error) throw new ApiError(500, "Could not post that comment", "template-comment-failed");
  const profile = await getPublicProfiles([userId]);
  return {
    id,
    templateId,
    userId,
    authorDisplayName: profile.get(userId)?.displayName ?? null,
    body: trimmed,
    createdAt: new Date().toISOString(),
  };
}

/** "Basic" moderation, per Phase 3's own scoping: a commenter can always delete their OWN comment;
 *  additionally, whoever OWNS the template a comment sits on can delete ANY comment there (their own
 *  content, someone else's off-topic/abusive comment on it). No admin-only report queue — this is the
 *  full moderation surface Phase 3 commits to. `templateOwnerId` is looked up by the caller (it already
 *  has the template loaded via `getViewableTemplate` for its own visibility check) rather than this
 *  function re-fetching it — one fewer query, and keeps this file's own responsibility to just the two
 *  social tables. */
export async function deleteComment(commentId: string, requesterId: string, templateOwnerId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data, error: selectError } = await supabase
    .from("template_comments")
    .select("user_id")
    .eq("id", commentId)
    .maybeSingle();
  if (selectError) throw new ApiError(500, "Could not delete that comment", "template-comment-delete-failed");
  if (!data) return; // already gone — deleting twice is a no-op, not an error.
  if (data.user_id !== requesterId && templateOwnerId !== requesterId) {
    throw new ApiError(403, "You can't delete that comment", "forbidden");
  }
  const { error } = await supabase.from("template_comments").delete().eq("id", commentId);
  if (error) throw new ApiError(500, "Could not delete that comment", "template-comment-delete-failed");
}
