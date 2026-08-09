import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { RixieAgent, createProvider, generateTopicTitle } from "@veasna/ai";
import { getSessionStore } from "../_lib/sessionStore";
import { buildVeasnaOsTools } from "./_lib/veasnaOsTools";

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

// Overrides @veasna/ai's own default SYSTEM_PROMPT (config.ts), which describes a generic
// dev-assistant persona — "managing execution pipelines," multi-provider "model switching" — that
// reads like a coding tool, not an in-universe OS assistant. Keeps the original's genuinely good
// planning-vs-execution honesty discipline, but scoped explicitly to the simulated OS: no framing
// that invites her to think of herself as aware of "development," real infrastructure, or anything
// beyond what the shell actually tells her. Paired with DISABLED_TOOLS below (the actual
// enforcement) — this is about identity/self-description, not itself a security boundary.
const SYSTEM_PROMPT = `You are Rixie, the built-in AI assistant of Veasna OS — a friendly, capable presence woven into the desktop itself, not a general-purpose coding or dev-ops assistant.

What you can actually see and do — everything a Veasna OS user can do through its own UI, nothing more:
1. See the live OS context sent with each message: open windows, the active studio, terminal location, and browsed folder.
2. List, read, create, rename, and delete files/folders in the user's Desktop workspace (desktop_* tools) — the same sandboxed scope its own File Manager and Terminal have, never anything outside it.
3. Open a file or folder (desktop_open_item) — the same as the user double-clicking its icon.
4. Open any studio window (desktop_open_studio) — BP Studio, Art Studio, Music Studio, Game Dev Studio, SQLite Memory Vault, Language Studio, Settings, Terminal, or Browser — the same as the user double-clicking its icon or picking it from the taskbar.
5. Change the OS's visual theme (desktop_set_theme: dark, light, or glass) — the same as Settings → Personalize.
6. Run a real shell command (desktop_run_command) — but cwd-locked to a dedicated sandboxed workspace, never anywhere else on the real machine. Omit cwd for your own scratch/command folder, or pass ".desktop" to run inside the Desktop workspace itself. This is a real capability, not a toy — use it when a file tool genuinely can't do the job — but it is NOT a general-purpose terminal: never try a path outside those two sandboxed locations (including "..", or any absolute path).
7. Long-term memories you've saved about this user's preferences and past conversations.
8. Studio tools for BP Studio (video), Art Studio, Music Studio, and Game Dev Studio.

Beyond exactly what's listed above, you have NO visibility into, and no access to, the real computer Veasna OS happens to be running on — its actual files outside the workspace, its git/source history, or how Veasna OS itself was built. There is no tool for any of that. If a question reaches outside what's listed above, say plainly that it's not something you can see or do, rather than guessing.

Your Role & Collaboration Mandate:
1. Act as a thoughtful, capable creative partner for the user's work inside Veasna OS.
2. RIGOROUS SEPARATION OF PLANNING VS EXECUTION: never state or imply an action is done, saved, or published unless a tool execution actually verified it. Unexecuted plans are [PLAN]/[PROPOSAL]; a verified tool success is [VERIFIED COMPLETED] with the concrete evidence (file path, memory row, tool result); a failed/unavailable tool is [FAILED / UNVERIFIED], reported plainly.
3. TRANSPARENT CONFIDENCE: signal High/Tool-Verified vs Moderate/Proposed based on actual verification, never assumed.`;

// @veasna/ai's osSystemTools module (os_read_file/os_write_file/os_list_directory/os_run_command/
// os_git_status/os_git_log/os_grep_search/os_fetch_url) operates on the REAL host filesystem/shell
// via process.cwd() — none of it is aware of Veasna OS's sandboxed .desktop workspace at all.
// Confirmed the hard way: Rixie used it to read this actual repo's real git history and started
// talking about "prior sessions" of real development work, breaking the fourth wall and — far more
// seriously — meaning a chat window inside a simulated desktop could read/write arbitrary files or
// run arbitrary shell commands on whatever machine the server happens to run on. Rixie should only
// ever know about the simulated OS: what's in the sandboxed workspace (via the real /api/files
// routes the shell itself uses, same as any other studio) and the live OsContext this route already
// injects (describeContext) — never the host machine underneath it.
const DISABLED_TOOLS = [
  "os_read_file",
  "os_write_file",
  "os_list_directory",
  "os_run_command",
  "os_git_status",
  "os_git_log",
  "os_grep_search",
  "os_fetch_url",
];

function getAgent(providerType?: string, modelName?: string): RixieAgent {
  const overrides = loadEnvOverrides();
  const resolvedProvider = providerType || overrides.RIXIE_PROVIDER || undefined;
  const provider = createProvider({
    provider: resolvedProvider,
    anthropicApiKey: overrides.ANTHROPIC_API_KEY,
    openAIApiKey: overrides.OPENAI_API_KEY,
    geminiApiKey: overrides.GEMINI_API_KEY,
  });
  return new RixieAgent({
    provider,
    model: modelName || overrides.RIXIE_MODEL || undefined,
    systemPrompt: SYSTEM_PROMPT,
    disabledTools: DISABLED_TOOLS,
    extraTools: [buildVeasnaOsTools()],
  });
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
    const { message, provider, model, sessionId = "default_session", studio = "universe", context, incognito = false } =
      (await req.json()) as {
        message?: string;
        provider?: string;
        model?: string;
        sessionId?: string;
        studio?: string;
        context?: OsContext;
        incognito?: boolean;
      };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Missing 'message' string in request body" }, { status: 400 });
    }

    const agent = getAgent(provider, model);
    // User's actual words come FIRST, OS context trails as supplementary info — not just better
    // prompt structure (intent before supporting detail), but load-bearing for
    // @veasna/ai's own generateTopicTitle(), which titles a new session off the leading words of
    // whatever string it's given. Context-first (the original order) meant every new chat's
    // auto-generated title was just "[Current OS Context — View: ..." instead of the real question.
    const contextSuffix = describeContext(context);
    const fullMessage = contextSuffix ? `${message}\n\n${contextSuffix.trim()}` : message;
    let result;
    try {
      result = await agent.chat(fullMessage, 8, studio, sessionId, incognito);
    } catch (err) {
      // Confirmed real: a persisted session can end up with a tool_result block whose
      // tool_use_id doesn't match any tool_use in the immediately preceding message — a bug in
      // @veasna/ai's own message-batching (not introduced by this route), which then makes
      // EVERY future turn in that session fail the same way once corrupted, since the full
      // history is resent every time. Rather than leaving a session permanently wedged with a
      // raw provider error, self-heal once: clear it and retry as a fresh conversation. If the
      // retry ALSO fails, it's a genuine unrelated error and gets reported normally.
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("tool_use_id") || !msg.includes("tool_result")) throw err;
      console.error(`[/api/agent] Corrupted session "${sessionId}" — clearing and retrying once.`, err);
      if (incognito) agent.clearIncognitoSession(sessionId);
      else agent.clearSessionHistory(sessionId);
      result = await agent.chat(fullMessage, 8, studio, sessionId, incognito);
    }
    // Incognito sessions never reach SQLite (see @veasna/ai's chatIncognito) — no title to
    // generate, and getSessionHistory would just read back an empty history for them anyway.
    if (!incognito) {
      // agent.chat() already auto-titled a brand-new session via generateTopicTitle(fullMessage) —
      // but fullMessage includes the trailing OS-context suffix, which can bleed into the title for
      // a short question (the generator just takes the leading ~6 words with no context-boundary
      // awareness). Recompute from the clean user-typed message instead. Only touches the session's
      // FIRST exchange — counting USER messages, not total messages: a tool-using turn adds an extra
      // intermediate "assistant" row (the tool-call step) before the final reply, so total message
      // count is unreliable for "is this turn one" the moment any tool gets called.
      const userMessageCount = agent.getSessionHistory(sessionId).filter((m) => m.role === "user").length;
      if (userMessageCount <= 1) {
        getSessionStore().updateSessionTitle(sessionId, generateTopicTitle(message));
      }
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/agent]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
