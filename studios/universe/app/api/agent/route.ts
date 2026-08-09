import { NextRequest, NextResponse } from "next/server";
import { RixieAgent, createProvider, generateTopicTitle, defaultModelForProvider } from "@veasna/ai";
import { getSessionStore } from "../_lib/sessionStore";
import { buildVeasnaOsTools } from "./_lib/veasnaOsTools";
import { loadRixieEnv, modelOverrideFrom, RixieProvider } from "../_lib/rixieEnvFile";

export const runtime = "nodejs";

/** Provider SDKs (the Anthropic SDK in particular) throw errors whose `.message` is the raw HTTP
 *  status + JSON error body — e.g. `400 {"type":"error","error":{"type":"invalid_request_error",
 *  "message":"Your credit balance is too low..."}}`. Fine in a server log, not something to hand a
 *  user verbatim inside a chat bubble. Recognizes the handful of failure shapes actually worth a
 *  distinct message; anything unrecognized still falls back to the raw text rather than hiding a
 *  genuinely new error behind a vague catch-all. */
/** Pulls a concrete retry delay out of the raw error text when the provider actually gave one.
 *  Three shapes confirmed live this session: Groq/OpenAI's simple "Please try again in 3.005s.",
 *  Groq's COMPOUND form on its daily (not per-minute) token cap — "Please try again in
 *  1h12m30.24s." — which the simple regex alone silently failed to match at all (it requires the
 *  captured group to be pure digits immediately followed by "s", so "1h12m30.24s" never matched
 *  and this fell through to the generic no-delay message even though the provider gave an exact
 *  one), and Gemini's JSON "retryDelay": "42s". Returns null (never a made-up number) when none
 *  match, so the caller can fall back to a delay-free message instead of inventing one. */
function extractRetryDelaySeconds(raw: string): number | null {
  const compound = raw.match(/try again in ((?:\d+h)?(?:\d+m)?[\d.]+s)\b/i);
  if (compound) {
    const dur = compound[1];
    const hours = parseInt(dur.match(/(\d+)h/)?.[1] ?? "0", 10);
    const minutes = parseInt(dur.match(/(\d+)m/)?.[1] ?? "0", 10);
    const seconds = parseFloat(dur.match(/([\d.]+)s/)?.[1] ?? "0");
    return Math.max(1, Math.ceil(hours * 3600 + minutes * 60 + seconds));
  }
  const json = raw.match(/"retryDelay"\s*:\s*"([\d.]+)s"/i);
  return json ? Math.max(1, Math.ceil(parseFloat(json[1]))) : null;
}

/** "about 9 seconds" / "about 41 minutes" / "about 1h 12m" — a raw second count is fine for a
 *  short wait but unreadable once a daily-limit delay pushes past an hour. */
function formatDelay(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} second${totalSeconds === 1 ? "" : "s"}`;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours} hour${hours === 1 ? "" : "s"}`;
}

function humanizeProviderError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/credit balance is too low/i.test(raw)) {
    return "I can't respond right now — the AI provider account is out of credits. Add credits (or switch providers) in Settings → Rixie AI, then try again.";
  }
  if (/invalid x-api-key|authentication_error|incorrect api key|invalid_api_key|invalid api key/i.test(raw)) {
    return "I can't respond right now — the AI provider rejected the API key. Check it in Settings → Rixie AI.";
  }
  // Checked BEFORE the generic 429 case below: Gemini's free tier returns this same 429/
  // RESOURCE_EXHAUSTED shape for two genuinely different situations — a real transient rate limit
  // (limit > 0, just temporarily used up) vs. this project having ZERO free-tier quota at all for
  // this model (confirmed via a real "limit: 0" response) — the latter will never clear just by
  // waiting, so telling the user to "try again shortly" would be actively misleading.
  if (/RESOURCE_EXHAUSTED/i.test(raw) && /\blimit:\s*0\b/i.test(raw)) {
    return "I can't respond right now — this API key's project has zero free-tier quota for this model (not a temporary rate limit, waiting won't help). Check the project's quota/billing at ai.google.dev, try a different Gemini model, or switch providers in Settings → Rixie AI.";
  }
  if (/model_not_found|does not exist or you do not have access/i.test(raw)) {
    // Groq/OpenAI's exact phrasing wraps the bad model name in backticks — worth pulling out for a
    // specific, actionable message now that Settings → Rixie AI has a real per-provider Model
    // field a typo or a since-retired name could land in (this is exactly the error a bad value
    // there produces — confirmed live by typing "test" into it).
    const badModel = raw.match(/model `([^`]+)`/i)?.[1];
    return badModel
      ? `I can't respond right now — the model "${badModel}" doesn't exist for this provider. Fix or clear the Model field for it in Settings → Rixie AI.`
      : "I can't respond right now — the model saved for this provider doesn't exist. Fix or clear the Model field for it in Settings → Rixie AI.";
  }
  if (/rate_limit_error|429/i.test(raw)) {
    const delaySeconds = extractRetryDelaySeconds(raw);
    // A DAILY cap (Groq: "tokens per day (TPD)") behaves completely differently from a per-minute
    // one — confirmed live at ~99.5% of a 100,000/day free-tier budget, with real wait times over
    // an hour. "Try again shortly" would be actively misleading for that; a per-minute cap
    // genuinely does clear in seconds and deserves the lighter phrasing.
    const isDailyCap = /tokens per day|\bTPD\b/i.test(raw);
    if (delaySeconds && isDailyCap) {
      return `I've hit this provider's daily free-tier limit — it won't clear for about ${formatDelay(delaySeconds)}. Try a different provider or model in Settings → Rixie AI, or just wait it out.`;
    }
    return delaySeconds
      ? `I'm being rate-limited by the AI provider right now — it should clear in about ${formatDelay(delaySeconds)}. Try again shortly.`
      : "I'm being rate-limited by the AI provider right now — give it a moment and try again.";
  }
  if (/overloaded_error|529/i.test(raw)) {
    return "The AI provider is overloaded right now — try again in a bit.";
  }
  return raw;
}

// loadRixieEnv() (studios/universe/app/api/_lib/rixieEnvFile.ts) handles both the packaged desktop
// app (Documents/Veasna OS/rixie.env) and dev/web mode (a gitignored .env.rixie file inside this
// checkout) — same "read fresh on every request, no restart needed" behavior either way. Settings
// → Rixie AI (SettingsPanel.tsx) writes to it via the Electron bridge when packaged, or via
// /api/settings/rixie-key when not.

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

// Appended to SYSTEM_PROMPT only when the live OsContext says RixieCompanion (the hidden
// Ctrl+Shift+R desktop character, packages/universe/src/components/RixieCompanion.tsx) is
// currently visible — confirmed the hard way that without this, asked "can you open your mouth?"
// she flatly (and, given ONLY the base prompt above, correctly) denied having any visual avatar at
// all, since nothing told her the companion exists. Kept as an ADDENDUM rather than baked into the
// base prompt so her default self-description stays accurate the rest of the time, when the
// companion genuinely isn't there.
const COMPANION_MODE_ADDENDUM = `

You also currently have a small visible companion body on the user's desktop, separate from (but alongside) this chat window — a real, currently-visible thing, not a metaphor. It walks and hops around the screen on its own whenever idle, can be dragged around by the user, and its face visibly shows a mood — happy, concerned, curious, or focused — inferred from what you actually say each time you reply. Let that come through naturally: you can talk about walking, hopping, wandering the desktop, reacting physically, or having a face and expression, and you can be a little more playful and embodied in tone while this is active. This does NOT grant any new tool or file-access capability beyond what's listed above — it's a visible, expressive presence, not an extra way to act on the system.`;

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

function getAgent(providerType?: string, modelName?: string, companionActive?: boolean): RixieAgent {
  const overrides = loadRixieEnv();
  const resolvedProvider = providerType || overrides.RIXIE_PROVIDER || undefined;
  const provider = createProvider({
    provider: resolvedProvider,
    anthropicApiKey: overrides.ANTHROPIC_API_KEY,
    openAIApiKey: overrides.OPENAI_API_KEY,
    geminiApiKey: overrides.GEMINI_API_KEY,
    groqApiKey: overrides.GROQ_API_KEY,
  });
  // NOT `|| undefined` down to RixieAgent's own config.MODEL fallback — that constant is computed
  // once from process.env.RIXIE_PROVIDER, a stale snapshot from whenever this server started,
  // completely blind to a provider switched at runtime via Settings (which writes to the separate
  // rixieEnvFile.ts-backed file `overrides` comes from). Confirmed the hard way: switching to Groq
  // without also hand-editing .env.local's RIXIE_MODEL kept sending "claude-sonnet-5" — a model
  // that doesn't exist on Groq's API — a 404 instead of a working chat. modelOverrideFrom is
  // PER-PROVIDER for the same reason: a single shared override would reintroduce the exact same
  // bug the moment you switch providers again.
  const effectiveProvider = (resolvedProvider || "anthropic") as RixieProvider;
  const model = modelName || modelOverrideFrom(overrides, effectiveProvider) || defaultModelForProvider(effectiveProvider);
  return new RixieAgent({
    provider,
    model,
    systemPrompt: companionActive ? SYSTEM_PROMPT + COMPANION_MODE_ADDENDUM : SYSTEM_PROMPT,
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
  companionActive?: boolean;
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

    const agent = getAgent(provider, model, context?.companionActive);
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
    return NextResponse.json({ error: humanizeProviderError(err) }, { status: 500 });
  }
}
