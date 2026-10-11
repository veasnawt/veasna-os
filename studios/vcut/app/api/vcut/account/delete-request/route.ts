import { getSupabaseAdminClient, getSessionUser } from "@veasnawt/auth/server";
import { corsPreflight } from "../../_lib/localOnly";
import { VCUT_HOSTED } from "../../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DeleteRequestBody {
  email: string;
  reason?: string;
}

export async function POST(req: Request) {
  try {
    const input: unknown = await req.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return Response.json({ error: "A valid deletion request is required." }, { status: 400 });
    }
    const body = input as DeleteRequestBody;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (typeof body.email !== "string" || !email || email.length > 254 || !email.includes("@") || (body.reason !== undefined && (typeof body.reason !== "string" || body.reason.length > 2000))) {
      return Response.json({ error: "A valid email address is required." }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    let authenticatedUser = null;

    if (token) {
      try {
        authenticatedUser = await getSessionUser(token);
      } catch {
        // Unauthenticated web request is allowed
      }
    }

    if (!VCUT_HOSTED) {
      return Response.json({ error: "Account deletion requests must be submitted to vcut.io." }, { status: 503 });
    }
    if (!authenticatedUser || authenticatedUser.email?.toLowerCase() !== email) {
      return Response.json({ error: "Sign in to the account you want to delete, or email support@vcut.io to verify ownership." }, { status: 401 });
    }

    if (VCUT_HOSTED) {
      const db = getSupabaseAdminClient();

      if (authenticatedUser && authenticatedUser.email?.toLowerCase() === email) {
        const { error } = await db.auth.admin.updateUserById(authenticatedUser.id, {
          user_metadata: {
            deletion_requested_at: new Date().toISOString(),
            deletion_reason: body.reason ?? null,
          },
        });
        if (error) {
          return Response.json({ error: "Couldn't save your deletion request. Please retry or email support@vcut.io." }, { status: 503 });
        }
      }

      console.info("[Account Deletion Request] Saved for authenticated user", authenticatedUser.id);
    }

    return Response.json(
      {
        ok: true,
        message:
          "Account deletion request saved. Support must verify and process your request.",
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("[Account Deletion Error]", error);
    return Response.json(
      { error: "Internal server error. Please contact support@vcut.io directly." },
      { status: 500 }
    );
  }
}

export const OPTIONS = corsPreflight;
