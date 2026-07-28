# Rixie 5-Stage Evolution Blueprint

---

## ── STAGE 1: CORE CHAT & PROVIDER ENGINE (COMPLETED)
- **Multi-Provider LLM Transport**: Standardized provider adapters for Anthropic (`claude-sonnet-5`), OpenAI (`gpt-4o`), Gemini (`gemini-2.0-flash`), and local Ollama (`llama3.1`).
- **Dynamic Provider Switcher**: Real-time provider selection in UI dropdown and CLI slash commands.
- **Fluent Builder SDK**: `Rixie.builder()` and factory shortcuts (`Rixie.createAnthropic()`, `Rixie.createOpenAI()`, etc.).
- **Console UI & CLI REPL**: Monospace tool trace cards and dark ambient UI.

---

## ── STAGE 2: HYBRID SEMANTIC MEMORY SYSTEM (NEXT IMMEDIATE FOCUS)
- **4 Cognitive Memory Tiers**:
  1. *Short-Term Working Memory*: Sliding window + context summary buffer.
  2. *Episodic Memory*: Time-stamped narrative events of creative sessions ($e^{-\lambda t}$ time decay).
  3. *Semantic Memory*: Studio facts, rules, and constraints (FTS5 + Vector Embeddings).
  4. *User Profile Memory*: Pinned core preferences ($\lambda = 0$ zero decay).
- **SQLite FTS5 + Vector Embeddings**: In-database keyword matching + vector similarity powered by `provider.embed()`.
- **Automatic Memory Extraction**: Post-turn fact and preference extraction into `memory.db`.
- **Pre-Turn Memory Retrieval**: Automatic injection of relevant memories into prompt context before LLM inference.

---

## ── STAGE 3: MULTI-STUDIO TOOL ARCHITECTURE & SECURITY MANAGER
- **3-Tier Permission Manager**:
  - *Tier 1*: Read-Only (Auto-approved).
  - *Tier 2*: Workspace Write (Policy validated).
  - *Tier 3*: High-Risk System / Admin (Interactive user approval prompt required).
- **Plugin System (`RixiePlugin`)**: Modular tool registration for BP Studio, Art, Music, and Game Dev.
- **MCP Protocol Adapter**: Model Context Protocol integration for connecting external MCP servers.
- **Dynamic Tool Routing**: Filter tools passed to LLM based on active studio context to prevent tool collision.

---

## ── STAGE 4: COGNITIVE REASONING LOOP & SELF-CORRECTION
- **5 Decoupled Subsystems**: `Planner`, `Executor`, `Reflection`, `Summarizer`, `MemoryManager`.
- **Reflection Auto-Retry**: Intercept tool execution errors and malformed JSON, generating diagnostic reflection turns and auto-retrying.
- **SessionStore**: SQLite-backed session persistence (`sessions` and `messages` tables) replacing in-memory arrays.
- **Summarizer Buffer**: Automatic session summarization for long multi-turn threads.

---

## ── STAGE 5: OS SUPERPOWERS & JARVIS COMPANION (SUBAGENTS & TELEMETRY)
- **OS Superpowers**: Code Editing, Image Generation (SD/ComfyUI), Voice (TTS/STT), Calendar, and Email.
- **Subagent Delegation**: Spawning specialist background subagents (`spawn_subagent`, `send_message`).
- **2-Layer Observability UI**: Clean Co-Creation Surface + Layer 2 Inspector Panel (Thinking Tokens, Memory Scores, Tool Latencies, API Cost Calculator).
- **Server-Sent Events (SSE) Streaming**: Real-time token streaming for typewriter UI feedback.
