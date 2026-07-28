# Granular Milestone Roadmap for Rixie OS

---

## 🎯 Milestone 0.1: Foundation & Core Abstractions (COMPLETED)

### Deliverables:
- [x] **Provider Abstraction**: Standardized `LLMProvider` interface for Anthropic (`claude-sonnet-5`), OpenAI (`gpt-4o`), Gemini (`gemini-2.0-flash`), and local Ollama (`llama3.1`).
- [x] **Dynamic Provider Switching**: Real-time provider selection in UI dropdown and CLI slash commands.
- [x] **Persistent SQLite Memory Store**: Basic SQLite database (`memory.db`) storing cross-session studio memories.
- [x] **Programmatic Builder SDK**: Fluent `Rixie.builder()` and factory shortcuts (`Rixie.createAnthropic()`, `Rixie.createOpenAI()`, etc.).
- [x] **Studio Tool Registry**: Modular tool dispatchers for BP Studio, Art, Music, and Game Dev.

---

## 🚀 Milestone 0.2: Monorepo Architecture & Security Hardening (IMMEDIATE NEXT STEP)

### Deliverables:
- [ ] **Package Decoupling**: Re-organize monorepo into 6 workspace packages (`rixie-core`, `rixie-providers`, `rixie-memory`, `rixie-security`, `rixie-ui`, `rixie-cli`).
- [ ] **3-Tier Permission Manager**: Build `PermissionManager` in `rixie-security`:
  - **Tier 1**: Auto-approved Read-only operations.
  - **Tier 2**: Workspace Write operations with policy validation.
  - **Tier 3**: High-Risk System operations (shell execution, email sending) requiring interactive user confirmation.
- [ ] **OpenAI-Compatible Driver**: Abstract `OpenAICompatibleDriver` base transport driver to eliminate code duplication across OpenAI, OpenRouter, Groq, DeepSeek, Gemini, and Ollama.
- [ ] **SQLite Session Persistence**: Add `sessions` and `messages` tables to replace in-memory `this.history` arrays.

---

## 🧠 Milestone 0.3: Cognitive Reasoning Pipeline & Self-Correction

### Deliverables:
- [ ] **5 Cognitive Subsystems**: Implement decoupled modules (`Planner`, `Executor`, `Reflection`, `Summarizer`, `MemoryManager`).
- [ ] **Reflection Auto-Retry**: Intercept tool execution errors / malformed JSON from local models, generate a diagnostic reflection turn, and trigger an auto-corrected retry.
- [ ] **Summarizer Sliding Window**: Maintain a 10-turn uncompressed sliding window, compressing older dialogue into a `[Session Summary]` block to prevent context window overflow.
- [ ] **Dynamic Tool Routing**: Filter tools passed to LLM based on active studio context to prevent tool collision and token waste.

---

## 🔬 Milestone 0.4: Hybrid Semantic Memory Engine & Memory Taxonomy

### Deliverables:
- [ ] **SQLite FTS5 Full-Text Search**: In-database keyword matching replacing JavaScript array scans.
- [ ] **Vector Embedding Search**: `sqlite-vec` / cosine similarity search powered by `provider.embed()`.
- [ ] **Hybrid Ranking Formula**: Combine vector similarity, FTS5 rank, importance, and exponential time decay:
  $$\text{Score} = (w_1 \cdot \text{Vector} + w_2 \cdot \text{FTS5} + w_3 \cdot \text{Importance}) \cdot e^{-\lambda t}$$
- [ ] **User Profile Tier**: Pinned core preferences with zero time decay ($\lambda = 0$).
- [ ] **Post-Turn Auto Extraction**: Asynchronously extract user preferences and facts after each conversation turn.

---

## 🔌 Milestone 0.5: Plugin Ecosystem & OS Superpowers

### Deliverables:
- [ ] **RixiePlugin System**: Plugin Manager, lifecycle hooks (`onInit`, `onShutdown`), and registration API.
- [ ] **Model Context Protocol (MCP)**: Server connector for external MCP servers.
- [ ] **5 Core OS Plugins**:
  - `codeEditingPlugin`: Line-range replacements, unified diffs, syntax checking.
  - `imageGenPlugin`: Local ComfyUI / SD WebUI asset generation & background removal.
  - `voiceAudioPlugin`: TTS (ElevenLabs), STT (Whisper), and WebAudio playback.
  - `calendarPlugin`: Studio task scheduling & deadline tracking.
  - `emailPlugin`: Email drafting & Tier 3 user prompt approval.

---

## 🏆 Milestone 1.0: Production Release & 2-Layer Telemetry UI

### Deliverables:
- [ ] **2-Layer Console UI**: Modular React components (`AgentConsole`, `MessageStream`, `ToolTraceCard`).
- [ ] **Layer 2 Telemetry Inspector**: Visualizer for thinking tokens, memory recall scores, tool latencies, and turn/session API costs.
- [ ] **Server-Sent Events (SSE) Streaming**: Real-time token streaming for typewriter UI feedback.
- [ ] **Interactive Tool Approval Cards**: Stream inline confirmation modals for Tier 3 system operations.
- [ ] **Subagent Delegation**: Spawn specialist background subagents (`spawn_subagent`, `send_message`).
