import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { RixieAgent, createProvider } from "@veasna/ai";

export const runtime = "nodejs";

/** In the packaged desktop app, an optional `Documents/Veasna OS/rixie.env` (written by
 *  Settings → Rixie AI) can override the provider/API key that would otherwise come from
 *  process.env — read fresh on every request rather than once at server-start, so saving a new
 *  key in Settings takes effect on the very next message with no server restart needed (unlike
 *  the equivalent BP Studio feature this replaced, which had to kill and re-fork the whole
 *  server). Absent entirely in dev/web mode (no VEASNA_WORKSPACE_ROOT there) — those users
 *  configure `.env.local` directly, same as always. */
function loadEnvOverrides(): Record<string, string> {
  const workspaceRoot = process.env.VEASNA_WORKSPACE_ROOT;
  if (!workspaceRoot) return {};
  const envPath = path.join(workspaceRoot, "rixie.env");
  if (!fs.existsSync(envPath)) return {};
  const result: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function getAgent(providerType?: string, modelName?: string): RixieAgent {
  const overrides = loadEnvOverrides();
  const resolvedProvider = providerType || overrides.RIXIE_PROVIDER || undefined;
  const provider = createProvider({
    provider: resolvedProvider,
    anthropicApiKey: overrides.ANTHROPIC_API_KEY,
    openAIApiKey: overrides.OPENAI_API_KEY,
    geminiApiKey: overrides.GEMINI_API_KEY,
  });
  return new RixieAgent({ provider, model: modelName || overrides.RIXIE_MODEL || undefined });
}

/** What the shell can honestly tell Rixie about what the user is doing right now — sent by
 *  VeasnaShell.tsx alongside every chat message (see RixieWindow.tsx). Deliberately small and
 *  literal (no inferred intent) — the same "don't fabricate" discipline as Task Manager's real
 *  window list. */
interface OsContext {
  mode?: "3d" | "list";
  openStudios?: string[];
  activeStudio?: string | null;
  terminalCwd?: string | null;
  browsingPath?: string | null;
}

function describeContext(context?: OsContext): string {
  if (!context) return "";
  const lines: string[] = [];
  if (context.mode) lines.push(`View: ${context.mode === "3d" ? "3D cosmos" : "Desktop"}`);
  if (context.openStudios && context.openStudios.length > 0) lines.push(`Open windows: ${context.openStudios.join(", ")}`);
  if (context.activeStudio) lines.push(`Active window: ${context.activeStudio}`);
  if (context.terminalCwd != null) lines.push(`Terminal is at: ${context.terminalCwd || "Desktop"}`);
  if (context.browsingPath != null) lines.push(`Browsing folder: ${context.browsingPath || "Desktop"}`);
  if (lines.length === 0) return "";
  return `[Current OS context — ${lines.join(" | ")}]\n\n`;
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
    console.error("[/api/agent]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/agent — Execute turn and persist to SQLite SessionStore
export async function POST(req: NextRequest) {
  try {
    const { message, provider, model, sessionId = "default_session", studio = "universe", context } =
      (await req.json()) as {
        message?: string;
        provider?: string;
        model?: string;
        sessionId?: string;
        studio?: string;
        context?: OsContext;
      };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Missing 'message' string in request body" }, { status: 400 });
    }

    const agent = getAgent(provider, model);
    const fullMessage = describeContext(context) + message;
    try {
      const result = await agent.chat(fullMessage, 8, studio, sessionId);
      return NextResponse.json(result);
    } catch (err) {
      // Confirmed real: a persisted session can end up with a tool_result block whose
      // tool_use_id doesn't match any tool_use in the immediately preceding message — a bug in
      // @veasna/ai's own message-batching (not introduced by this route), which then makes
      // EVERY future turn in that session fail the same way once corrupted, since the full
      // history is resent every time. Rather than leaving a session permanently wedged with a
      // raw provider error, self-heal once: clear it and retry as a fresh conversation. If the
      // retry ALSO fails, it's a genuine unrelated error and gets reported normally.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("tool_use_id") && msg.includes("tool_result")) {
        console.error(`[/api/agent] Corrupted session "${sessionId}" — clearing and retrying once.`, err);
        agent.clearSessionHistory(sessionId);
        const result = await agent.chat(fullMessage, 8, studio, sessionId);
        return NextResponse.json(result);
      }
      throw err;
    }
  } catch (err) {
    console.error("[/api/agent]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
