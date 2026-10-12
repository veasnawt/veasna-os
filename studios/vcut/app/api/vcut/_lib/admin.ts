import {
  getSessionUser,
  getSupabaseAdminClient,
  type SessionUser,
} from "@veasnawt/auth/server";
import { ApiError } from "./paths.ts";
import { TtlCache } from "./authCache.ts";
import { isAdminIdentity } from "./adminPolicy.ts";

export const adminIdentity = (user: SessionUser) =>
  isAdminIdentity(
    user,
    process.env.VCUT_ADMIN_USER_IDS,
    process.env.VCUT_ADMIN_EMAILS,
  );

export async function requireAdmin(req: Request): Promise<SessionUser> {
  if (process.env.VCUT_HOSTED !== "true")
    throw new ApiError(503, "Admin is available on the hosted VCut server.");
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ") || !header.slice(7).trim())
    throw new ApiError(401, "Sign in to continue.");
  // Verify fresh for every privileged request, even when normal media auth is cached.
  const user = await getSessionUser(header.slice(7).trim());
  if (!user)
    throw new ApiError(401, "Your session has expired. Sign in again.");
  if (!adminIdentity(user))
    throw new ApiError(403, "This account does not have VCut admin access.");
  return user;
}
export function adminRoute(
  handler: (req: Request, user: SessionUser) => Promise<unknown>,
) {
  return async (req: Request) => {
    const headers = {
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
      "X-Content-Type-Options": "nosniff",
    };
    try {
      const user = await requireAdmin(req);
      return Response.json(await handler(req, user), { headers });
    } catch (error) {
      const known = error instanceof ApiError;
      if (!known) console.error("[vcut admin] request failed", error);
      return Response.json(
        {
          error: known
            ? error.message
            : "Admin data is unavailable. Check server logs and migration 0022.",
        },
        { status: known ? error.status : 503, headers },
      );
    }
  };
}
export function assertDb(result: { error: unknown }): void {
  if (result.error) throw result.error;
}
// Normal playback requests arrive in bursts; bound revocation latency to five seconds.
// Admin sessions and every privileged action remain freshly verified.
const userAccess = new TtlCache<boolean>();
const projectAccess = new TtlCache<boolean>();
export function invalidateAdminAccess(target: string) {
  userAccess.delete(target);
  projectAccess.delete(target);
}
export async function assertVcutUserEnabled(userId: string) {
  if (userAccess.get(userId) === true) return;
  const result = await getSupabaseAdminClient()
    .from("vcut_admin_user_controls")
    .select("suspended")
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error)
    throw new ApiError(
      503,
      "Account access controls are temporarily unavailable.",
    );
  if (result.data?.suspended)
    throw new ApiError(
      403,
      "Your VCut account is suspended. Contact support@vcut.io.",
      "account-suspended",
    );
  userAccess.set(userId, true, 5000);
}
export async function assertVcutProjectEnabled(projectId: string) {
  if (projectAccess.get(projectId) === true) return;
  const result = await getSupabaseAdminClient()
    .from("vcut_admin_project_controls")
    .select("restricted")
    .eq("project_id", projectId)
    .maybeSingle();
  if (result.error)
    throw new ApiError(
      503,
      "Project access controls are temporarily unavailable.",
    );
  if (result.data?.restricted)
    throw new ApiError(
      403,
      "This project is restricted. Contact support@vcut.io.",
      "project-restricted",
    );
  projectAccess.set(projectId, true, 5000);
}
