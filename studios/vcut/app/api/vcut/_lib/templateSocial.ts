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
