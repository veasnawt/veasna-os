import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import { ApiError } from "./paths";
export async function blockedRelationships(userId: string): Promise<Set<string>> {
  const { data, error } = await getSupabaseAdminClient().from("user_blocks").select("owner_id,blocked_user_id").or(`owner_id.eq.${userId},blocked_user_id.eq.${userId}`);
  if (error) throw new ApiError(503, "Safety controls are temporarily unavailable.", "safety-unavailable");
  return new Set((data ?? []).map(row => row.owner_id === userId ? row.blocked_user_id : row.owner_id));
}
export async function assertCanInteract(viewerId: string, ownerId: string) {
  if (viewerId && viewerId !== ownerId && (await blockedRelationships(viewerId)).has(ownerId)) throw new ApiError(403, "This interaction is unavailable.", "blocked-user");
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
