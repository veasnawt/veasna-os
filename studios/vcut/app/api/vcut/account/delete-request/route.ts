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
    const body: DeleteRequestBody = await req.json();
    const email = body.email?.trim().toLowerCase();

    if (!email || !email.includes("@")) {
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

    if (VCUT_HOSTED) {
      const db = getSupabaseAdminClient();

      if (authenticatedUser && authenticatedUser.email?.toLowerCase() === email) {
        await db.auth.admin.updateUserById(authenticatedUser.id, {
          user_metadata: {
            deletion_requested_at: new Date().toISOString(),
            deletion_reason: body.reason ?? null,
          },
        });
      }

      console.info(
        `[Account Deletion Request] Email: ${email}, Authenticated: ${Boolean(
          authenticatedUser
        )}, UserID: ${authenticatedUser?.id ?? "unauthenticated"}, Reason: ${body.reason ?? "none"}`
      );
    }

    return Response.json(
      {
        ok: true,
        message:
          "Account deletion request received. Data will be purged within 30 days after verification.",
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
