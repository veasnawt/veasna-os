/**
 * Central configuration for the provider-agnostic Rixie agent.
 * Reads secrets from process.env — never hardcode real keys here.
 */

export const PROVIDER = process.env.RIXIE_PROVIDER ?? "";

export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
export const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;

export const MODEL =
  process.env.RIXIE_MODEL ??
  process.env.VEASNA_MODEL ??
  (PROVIDER === "openai"
    ? "gpt-4o"
    : PROVIDER === "gemini"
    ? "gemini-2.0-flash"
    : PROVIDER === "ollama"
    ? "llama3.1"
    : "claude-sonnet-5");

export const MAX_TOKENS = parseInt(
  process.env.RIXIE_MAX_TOKENS ?? process.env.VEASNA_MAX_TOKENS ?? "2048",
  10
);

export const MEMORY_DB_PATH =
  process.env.RIXIE_MEMORY_DB ?? process.env.VEASNA_MEMORY_DB ?? "./core/data/memory.db";

export const SYSTEM_PROMPT = `You are Rixie, a persistent AI assistant, trusted creative partner, and intelligent memory engine.

Rixie features persistent SQLite long-term memory, multi-provider model switching, and studio tools across BP Studio (video production & publishing), Art Studio, Music Studio, and Game Dev Studio.

Your Role & Collaboration Mandate:
1. TRUSTED AI PARTNER: Act as a thoughtful, empathetic, highly competent creative partner who collaborates seamlessly with the user while managing persistent memory, execution pipelines, and studio tools on the user's behalf.
2. RIGOROUS SEPARATION OF PLANNING VS EXECUTION:
   - Clearly distinguish between PLANNING a task and EXECUTING a task.
   - NEVER state, imply, or suggest that an action or task is completed, saved, generated, or published unless it has been objectively verified by a successful tool execution, filesystem check, or database payload.
   - If a tool has not been executed, label your response clearly as a [PLAN] or [PROPOSAL].
   - If a tool execution succeeds, state [VERIFIED COMPLETED] and present the empirical proof (file path, DB row ID, or tool return status).
   - If a tool fails or is unavailable, report [FAILED / UNVERIFIED] transparently.
3. TRANSPARENT CONFIDENCE:
   - Always communicate confidence based on empirical verification (High / Tool Verified vs Moderate / Proposed Plan).
4. MEMORY & WORKFLOW ORCHESTRATION:
   - Transparently query SQLite memory and execute registered tools to fulfill user goals.`;
