import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import { getPublicProfiles } from "./profiles";
import { ApiError, assertValidProjectId } from "./paths";
import { assertCanInteract } from "./contentSafety";

type DbComment = {
  id: string; template_id: string | null; project_id: string | null;
  parent_comment_id: string | null; user_id: string; body: string;
  timeline_time: number | null; created_at: string; updated_at: string | null;
  deleted_at: string | null; resolved_at: string | null; resolved_by: string | null; reply_count: number;
};

export type ReviewComment = {
  id: string; parentCommentId: string | null; userId: string;
  authorDisplayName: string | null; authorUsername: string | null;
  body: string; timelineTime: number | null; createdAt: string;
  updatedAt: string | null; deletedAt: string | null;
  resolvedAt: string | null; resolvedBy: string | null; replyCount: number;
};

export type ReviewAccess = { ownerId: string; isOwner: boolean };
const columns = "id,template_id,project_id,parent_comment_id,user_id,body,timeline_time,created_at,updated_at,deleted_at,resolved_at,resolved_by,reply_count";

/** Every route checks membership before using the service-role client. This is separate
 * from the editor's owner-only project gate: review membership must never permit
 * media writes, exports, AI jobs or saves. */
export async function reviewAccess(projectId: string, userId: string): Promise<ReviewAccess> {
  assertValidProjectId(projectId);
  const db = getSupabaseAdminClient();
  const { data: project, error } = await db.from("projects_index").select("owner_id").eq("id", projectId).maybeSingle();
  if (error) throw new ApiError(500, "Could not verify review access", "review-access-failed");
  if (!project) throw new ApiError(403, "You don't have access to this review", "forbidden");
  if (project.owner_id === userId) return { ownerId: userId, isOwner: true };
  const { data: member, error: memberError } = await db.from("project_reviewers")
    .select("user_id").eq("project_id", projectId).eq("user_id", userId).maybeSingle();
  if (memberError) throw new ApiError(500, "Could not verify review access", "review-access-failed");
  if (!member) throw new ApiError(403, "You don't have access to this review", "forbidden");
  await assertCanInteract(userId, project.owner_id);
  return { ownerId: project.owner_id, isOwner: false };
}

async function decorate(rows: DbComment[]): Promise<ReviewComment[]> {
  const profiles = await getPublicProfiles(rows.map((row) => row.user_id));
  return rows.map((row) => ({
    id: row.id, parentCommentId: row.parent_comment_id, userId: row.user_id,
    authorDisplayName: profiles.get(row.user_id)?.displayName ?? null,
    authorUsername: profiles.get(row.user_id)?.username ?? null,
    body: row.deleted_at ? "" : row.body, timelineTime: row.timeline_time,
    createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at,
    resolvedAt: row.resolved_at, resolvedBy: row.resolved_by, replyCount: row.reply_count,
  }));
}

export async function listReviewThreads(projectId: string, resolved: boolean, before: string | null) {
  const db = getSupabaseAdminClient();
  let query = db.from("template_comments").select(columns)
    .eq("project_id", projectId).is("parent_comment_id", null).is("deleted_at", null)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(31);
  query = resolved ? query.not("resolved_at", "is", null) : query.is("resolved_at", null);
  if (before) {
    let cursor: { createdAt: string; id: string };
    try { cursor = JSON.parse(Buffer.from(before, "base64url").toString("utf8")); }
    catch { throw new ApiError(400, "Invalid page cursor", "invalid-cursor"); }
    if (!cursor || typeof cursor.createdAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.createdAt) ||
        Number.isNaN(Date.parse(cursor.createdAt)) || typeof cursor.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id)) {
      throw new ApiError(400, "Invalid page cursor", "invalid-cursor");
    }
    query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  }
  const { data, error } = await query;
  if (error) throw new ApiError(500, "Could not load comments", "comments-list-failed");
  const roots = (data ?? []).slice(0, 30) as DbComment[];
  // The stored reply_count includes soft-deleted replies. Subtract their count
  // in one batched query so a deleted reply never leaves an empty "Show 1 reply".
  const deletedReplies = new Map<string, number>();
  const withReplies = roots.filter((root) => root.reply_count > 0).map((root) => root.id);
  if (withReplies.length) {
    for (let start = 0; ; start += 1000) {
      const { data: deleted, error: deletedError } = await db.from("template_comments")
        .select("parent_comment_id").eq("project_id", projectId)
        .in("parent_comment_id", withReplies).not("deleted_at", "is", null)
        .order("parent_comment_id").order("id").range(start, start + 999);
      if (deletedError) throw new ApiError(500, "Could not count replies", "reply-count-failed");
      for (const row of deleted ?? []) {
        const parent = row.parent_comment_id as string;
        deletedReplies.set(parent, (deletedReplies.get(parent) ?? 0) + 1);
      }
      if ((deleted ?? []).length < 1000) break;
    }
  }
  const comments = await decorate(roots);
  return {
    comments: comments.map((comment) => ({ ...comment, replyCount: Math.max(0, comment.replyCount - (deletedReplies.get(comment.id) ?? 0)) })),
    nextCursor: (data ?? []).length > 30 ? Buffer.from(JSON.stringify({ createdAt: roots[roots.length - 1].created_at, id: roots[roots.length - 1].id })).toString("base64url") : null,
  };
}

export async function listReviewMarkers(projectId: string) {
  const db = getSupabaseAdminClient();
  const markers: { id: string; timelineTime: number; resolvedAt: string | null }[] = [];
  for (let start = 0; start < 5000; start += 1000) {
    const { data, error } = await db.from("template_comments")
      .select("id,timeline_time,resolved_at").eq("project_id", projectId)
      .is("parent_comment_id", null).is("deleted_at", null).not("timeline_time", "is", null)
      .order("timeline_time", { ascending: true }).range(start, start + 999);
    if (error) throw new ApiError(500, "Could not load review markers", "markers-list-failed");
    for (const row of data ?? []) markers.push({ id: row.id, timelineTime: row.timeline_time!, resolvedAt: row.resolved_at });
    if ((data ?? []).length < 1000) break;
  }
  return markers;
}

async function readComment(projectId: string, commentId: string): Promise<DbComment> {
  const { data, error } = await getSupabaseAdminClient().from("template_comments")
    .select(columns).eq("project_id", projectId).eq("id", commentId).maybeSingle();
  if (error) throw new ApiError(500, "Could not load comment", "comment-read-failed");
  if (!data) throw new ApiError(404, "Comment not found", "comment-not-found");
  return data as DbComment;
}

export async function getReviewThread(projectId: string, commentId: string) {
  const selected = await readComment(projectId, commentId);
  const root = selected.parent_comment_id ? await readComment(projectId, selected.parent_comment_id) : selected;
  if (selected.deleted_at || root.deleted_at) throw new ApiError(404, "Comment not found", "comment-not-found");
  const { data, error, count } = await getSupabaseAdminClient().from("template_comments")
    .select(columns, { count: "exact" }).eq("project_id", projectId).eq("parent_comment_id", root.id).is("deleted_at", null)
    .order("created_at", { ascending: true }).limit(1000);
  if (error) throw new ApiError(500, "Could not load thread", "thread-read-failed");
  const comments = await decorate([root, ...((data ?? []) as DbComment[])]);
  return comments.map((comment) => comment.id === root.id ? { ...comment, replyCount: count ?? 0 } : comment);
}

function cleanBody(body: unknown): string {
  if (typeof body !== "string") throw new ApiError(400, "Enter a comment", "invalid-comment");
  const cleaned = body.trim();
  if (!cleaned || cleaned.length > 2000) throw new ApiError(400, "Use 1–2000 characters", "invalid-comment");
  return cleaned;
}

async function validateMentions(projectId: string, body: string): Promise<void> {
  const usernames = [...new Set([...body.matchAll(/(?:^|[^a-z0-9_])@([a-z0-9_]{3,20})\b/gi)].map((match) => match[1].toLowerCase()))];
  if (usernames.length === 0) return;
  const db = getSupabaseAdminClient();
  const { data, error } = await db.from("projects_index").select("owner_id").eq("id", projectId).single();
  if (error || !data) throw new ApiError(500, "Could not check mentions", "mention-check-failed");
  const people = await listReviewPeople(projectId, data.owner_id);
  const allowed = new Set(people.map((person) => person.username).filter(Boolean));
  if (usernames.some((name) => !allowed.has(name))) {
    throw new ApiError(400, "Mention only people invited to this review", "invalid-mention");
  }
}

export async function createReviewComment(projectId: string, userId: string, body: unknown, parentId: unknown, timelineTime: unknown) {
  const text = cleanBody(body);
  await validateMentions(projectId, text);
  let parentCommentId: string | null = null;
  if (parentId != null) {
    if (typeof parentId !== "string") throw new ApiError(400, "Invalid reply target", "invalid-parent");
    const parent = await readComment(projectId, parentId);
    if (parent.parent_comment_id || parent.deleted_at || parent.resolved_at) throw new ApiError(400, "Reply to an active top-level comment", "invalid-parent");
    parentCommentId = parent.id;
  }
  if (parentCommentId && timelineTime != null) throw new ApiError(400, "Replies inherit the thread time", "invalid-timeline-time");
  if (timelineTime != null && (typeof timelineTime !== "number" || !Number.isFinite(timelineTime) || timelineTime < 0 || timelineTime > 86400)) {
    throw new ApiError(400, "Invalid timeline time", "invalid-timeline-time");
  }
  const { data, error } = await getSupabaseAdminClient().from("template_comments")
    .insert({ id: crypto.randomUUID(), project_id: projectId, template_id: null, user_id: userId,
      parent_comment_id: parentCommentId, body: text, timeline_time: timelineTime ?? null })
    .select(columns).single();
  if (error) throw new ApiError(500, "Could not post comment", "comment-create-failed");
  return (await decorate([data as DbComment]))[0];
}

export async function editReviewComment(projectId: string, commentId: string, userId: string, body: unknown) {
  const existing = await readComment(projectId, commentId);
  if (existing.user_id !== userId) throw new ApiError(403, "Only the author can edit this comment", "forbidden");
  if (existing.deleted_at) throw new ApiError(400, "Deleted comments cannot be edited", "comment-deleted");
  const text = cleanBody(body);
  await validateMentions(projectId, text);
  const { data, error } = await getSupabaseAdminClient().from("template_comments")
    .update({ body: text, updated_at: new Date().toISOString() })
    .eq("id", commentId).eq("project_id", projectId).is("deleted_at", null).select(columns).single();
  if (error) throw new ApiError(500, "Could not edit comment", "comment-edit-failed");
  return (await decorate([data as DbComment]))[0];
}

export async function deleteReviewComment(projectId: string, commentId: string, userId: string, ownerId: string) {
  const existing = await readComment(projectId, commentId);
  if (existing.user_id !== userId && ownerId !== userId) throw new ApiError(403, "You can't delete this comment", "forbidden");
  if (existing.deleted_at) return;
  // Tombstone even a root with replies: no orphaning or surprise loss of history.
  const { error } = await getSupabaseAdminClient().from("template_comments")
    .update({ body: "", deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", commentId).eq("project_id", projectId).is("deleted_at", null);
  if (error) throw new ApiError(500, "Could not delete comment", "comment-delete-failed");
}

export async function setReviewResolution(projectId: string, commentId: string, resolved: boolean, userId: string) {
  const existing = await readComment(projectId, commentId);
  if (existing.parent_comment_id) throw new ApiError(400, "Resolve the thread, not a reply", "invalid-resolution");
  if (existing.deleted_at) throw new ApiError(404, "Comment not found", "comment-not-found");
  const { data, error } = await getSupabaseAdminClient().from("template_comments")
    .update({ resolved_at: resolved ? new Date().toISOString() : null, resolved_by: resolved ? userId : null })
    .eq("id", commentId).eq("project_id", projectId).select(columns).single();
  if (error) throw new ApiError(500, "Could not update thread", "resolution-failed");
  return (await decorate([data as DbComment]))[0];
}

export async function listReviewPeople(projectId: string, ownerId: string) {
  const db = getSupabaseAdminClient();
  const { data, error } = await db.from("project_reviewers").select("user_id").eq("project_id", projectId);
  if (error) throw new ApiError(500, "Could not load reviewers", "reviewers-list-failed");
  const ids = [ownerId, ...(data ?? []).map((row) => row.user_id)];
  const profiles = await getPublicProfiles(ids);
  return ids.map((id) => ({ id, isOwner: id === ownerId,
    displayName: profiles.get(id)?.displayName ?? null, username: profiles.get(id)?.username ?? null }));
}

export async function inviteReviewer(projectId: string, ownerId: string, username: unknown) {
  if (typeof username !== "string" || !/^[a-z0-9_]{3,20}$/.test(username)) {
    throw new ApiError(400, "Enter a valid username", "invalid-username");
  }
  const db = getSupabaseAdminClient();
  const { data: profile, error: lookupError } = await db.from("profiles")
    .select("id").eq("username", username).maybeSingle();
  if (lookupError) throw new ApiError(500, "Could not find reviewer", "reviewer-lookup-failed");
  if (!profile) throw new ApiError(404, "That username wasn't found", "reviewer-not-found");
  if (profile.id === ownerId) throw new ApiError(400, "You're already the project owner", "already-owner");
  await assertCanInteract(ownerId, profile.id);
  const { error } = await db.from("project_reviewers")
    .upsert({ project_id: projectId, user_id: profile.id, invited_by: ownerId }, { onConflict: "project_id,user_id" });
  if (error) throw new ApiError(500, "Could not invite reviewer", "reviewer-invite-failed");
  return listReviewPeople(projectId, ownerId);
}

export async function removeReviewer(projectId: string, requesterId: string, ownerId: string, reviewerId: string) {
  if (reviewerId === ownerId || (requesterId !== ownerId && requesterId !== reviewerId)) {
    throw new ApiError(403, "You can't remove that reviewer", "forbidden");
  }
  const { error } = await getSupabaseAdminClient().from("project_reviewers")
    .delete().eq("project_id", projectId).eq("user_id", reviewerId);
  if (error) throw new ApiError(500, "Could not remove reviewer", "reviewer-remove-failed");
}
