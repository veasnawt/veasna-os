import { NextRequest, NextResponse } from "next/server";
import { RixieAgent } from "rixie-core/core/agent/agent";
import { createProvider } from "rixie-core/core/providers";

export const runtime = "nodejs";

function getAgent(providerType?: string, modelName?: string): RixieAgent {
  const provider = providerType ? createProvider({ provider: providerType }) : undefined;
  return new RixieAgent({ provider, model: modelName || undefined });
}

// GET /api/agent?sessionId=default_session — Load persistent chat history
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId") || "default_session";
    const agent = new RixieAgent();
    const history = agent.getSessionHistory(sessionId);
    return NextResponse.json({ sessionId, messages: history });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/agent — Execute turn and persist to SQLite SessionStore
export async function POST(req: NextRequest) {
  try {
    const { message, provider, model, sessionId = "default_session", studio = "bp" } =
      (await req.json()) as {
        message?: string;
        provider?: string;
        model?: string;
        sessionId?: string;
        studio?: string;
      };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Missing 'message' string in request body" }, { status: 400 });
    }

    const agent = getAgent(provider, model);
    const result = await agent.chat(message, 8, studio, sessionId);

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
