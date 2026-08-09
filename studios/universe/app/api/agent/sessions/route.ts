import { NextRequest, NextResponse } from "next/server";
import { getSessionStore } from "../../_lib/sessionStore";

export const runtime = "nodejs";

// GET /api/agent/sessions — list Rixie chat sessions for RixieWindow's history sidebar, most
// recently updated first (SessionStore.getAllSessions()'s own ordering). Filtered to this studio
// since the underlying table is shared across whatever else might use @veasna/ai.
export async function GET() {
  try {
    const sessions = getSessionStore()
      .getAllSessions()
      .filter((s) => s.studio === "universe");
    return NextResponse.json({ sessions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/agent/sessions?sessionId=... — permanently removes a chat session. clearSession
// deletes the session row itself, not just its messages, so there's no separate "delete" method.
export async function DELETE(req: NextRequest) {
  try {
    const sessionId = new URL(req.url).searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "Missing 'sessionId' query param" }, { status: 400 });
    }
    getSessionStore().clearSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
