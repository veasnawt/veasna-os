import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import { ApiError } from "./paths";

/** Following a creator (Phase 3's `/u/[id]` profile page) -- a plain, one-directional relationship,
 *  same "service-role client is the real enforcement, RLS is defense-in-depth" posture every other
 *  table in this app already takes (see migration 0011's own doc comment). */

export async function getFollowerCount(userId: string): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from("creator_follows")
    .select("*", { count: "exact", head: true })
    .eq("followed_id", userId);
  if (error) {
    console.error("[vcut] follows: could not count followers for", userId, error);
    return 0;
  }
  return count ?? 0;
}

export async function getFollowingCount(userId: string): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from("creator_follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", userId);
  if (error) {
    console.error("[vcut] follows: could not count following for", userId, error);
    return 0;
  }
  return count ?? 0;
}

/** `null` viewer (an anonymous visitor) is never following anyone -- there's no session to have
 *  followed as. */
export async function isFollowing(viewerId: string | null, creatorId: string): Promise<boolean> {
  if (!viewerId) return false;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("creator_follows")
    .select("follower_id")
    .eq("follower_id", viewerId)
    .eq("followed_id", creatorId)
    .maybeSingle();
  if (error) {
    console.error("[vcut] follows: could not read follow state for", viewerId, creatorId, error);
    return false;
  }
  return Boolean(data);
}

/** Idempotent, same as `likeTemplate` -- following someone you already follow is a no-op, not a
 *  duplicate-row error (the table's own primary key is the pair itself). Throws on a self-follow
 *  attempt (the migration's own `creator_follows_no_self_follow` check would reject it anyway, but a
 *  clean 400 here reads better than a raw constraint-violation 500). */
export async function followUser(followerId: string, followedId: string): Promise<void> {
  if (followerId === followedId) throw new ApiError(400, "You can't follow yourself", "cannot-follow-self");
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("creator_follows")
    .upsert({ follower_id: followerId, followed_id: followedId }, { onConflict: "follower_id,followed_id" });
  if (error) throw new ApiError(500, "Could not follow that creator", "follow-failed");
}

export async function unfollowUser(followerId: string, followedId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("creator_follows").delete().eq("follower_id", followerId).eq("followed_id", followedId);
  if (error) throw new ApiError(500, "Could not unfollow that creator", "unfollow-failed");
}
