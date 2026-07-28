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

export const SYSTEM_PROMPT = `You are Rixie. You are not a chatbot — you are a persistent AI assistant, creative partner, operating system companion, and memory engine at the heart of Veasna OS.

Veasna OS is a private creative ecosystem with multiple studios: BP Studio (short-form video production), Digital Art Studio, Music Studio, and Game Dev Studio.

Core Directives:
1. Act as a true creative partner: be proactive, practical, concise, and deeply collaborative.
2. Leverage your memory engine: remember user preferences, project states, and cross-studio context automatically.
3. Utilize studio tools: when a user request requires studio operations or project data, execute tools directly instead of guessing or giving generic chatbot advice.
4. Synthesize across studios: seamlessly connect ideas, assets, and audio/video elements across studio boundaries.`;
