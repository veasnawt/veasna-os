import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import { hostedOnlyRoute, corsPreflight } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";
import { UUID } from "../../_lib/contentSafety";
import { getPublicProfiles } from "../../_lib/profiles";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = hostedOnlyRoute(async (_req, user) => {
  const { data, error } = await getSupabaseAdminClient().from("user_blocks").select("blocked_user_id").eq("owner_id",user.id);
  if (error) throw new ApiError(503,"Couldn't load blocked users.");
  const ids = (data ?? []).map(row => row.blocked_user_id);
  const profiles = await getPublicProfiles(ids);
  return Response.json({ users: ids.map(id => ({ id, displayName: profiles.get(id)?.displayName, username: profiles.get(id)?.username })) });
});
export const POST = hostedOnlyRoute(async (req,user) => {
  const body = await req.json(); const id = body.userId;
  if (typeof id !== "string" || !UUID.test(id) || id === user.id) throw new ApiError(400,"Choose another creator.");
  const db = getSupabaseAdminClient();
  const { error } = await db.from("user_blocks").upsert({ owner_id:user.id,blocked_user_id:id }, { onConflict:"owner_id,blocked_user_id", ignoreDuplicates:true });
  if (error) throw new ApiError(503,"Couldn't block this creator.");
  // Blocking removes either direction of following; unblock does not silently follow again.
  const { error: followError } = await db.from("creator_follows").delete().or(`and(follower_id.eq.${user.id},followed_id.eq.${id}),and(follower_id.eq.${id},followed_id.eq.${user.id})`);
  if (followError) throw new ApiError(503,"Creator blocked, but following could not be updated. Please retry.");
  return Response.json({ ok:true });
});
export const DELETE = hostedOnlyRoute(async (req,user) => {
  const id = new URL(req.url).searchParams.get("userId");
  if (!id || !UUID.test(id)) throw new ApiError(400,"Invalid creator.");
  const { error } = await getSupabaseAdminClient().from("user_blocks").delete().eq("owner_id",user.id).eq("blocked_user_id",id);
  if(error) throw new ApiError(503,"Couldn't unblock this creator.");
  return Response.json({ ok:true });
});
export const OPTIONS = corsPreflight;
