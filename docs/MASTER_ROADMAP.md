# Rixie 10-Year Evolutionary Master Roadmap

---

## 🎯 Strategic Objective
Evolve Rixie from a V1 function-calling loop into a world-class, provider-agnostic **AI Operating System Companion** — seamlessly unifying the autonomous system control of **Jarvis**, the workspace execution mastery of **Claude Code**, and the fluid creative dialogue of **ChatGPT**, tailored specifically for **Veasna OS**.

---

## 📅 Milestone Timeline & Phased Execution

```
2026 Q3               2026 Q4               2027 Q1               2027 Q2               2027+
  │                     │                     │                     │                     │
  ▼                     ▼                     ▼                     ▼                     ▼
┌──────────────┐     ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ MILESTONE 1  │ ──► │ MILESTONE 2  │ ──►  │ MILESTONE 3  │ ──►  │ MILESTONE 4  │ ──►  │ MILESTONE 5  │
│ Monorepo     │     │ Cognitive    │      │ Hybrid       │      │ Plugin System│      │ Multi-Agent  │
│ Refactoring &│     │ Reasoning    │      │ Semantic     │      │ & OS Tools   │      │ Subagents &  │
│ 3-Tier Sec   │     │ Loop         │      │ Memory       │      │ (MCP/Voice)  │      │ Telemetry UI │
└──────────────┘     └──────────────┘      └──────────────┘      └──────────────┘      └──────────────┘
```

---

### 🔹 Milestone 1: Monorepo Refactoring & 3-Tier Security (Months 1–3)
- [ ] **Package Decoupling**: Refactor `packages/rixie-core` into modular workspace packages (`rixie-core`, `rixie-providers`, `rixie-memory`, `rixie-security`, `rixie-ui`, `rixie-cli`).
- [ ] **3-Tier Permission Manager**: Implement `PermissionManager` in `rixie-security` (Read-only auto-approved, Workspace write policy checked, High-risk system user prompt required).
- [ ] **OpenAI-Compatible Driver**: Separate generic `OpenAICompatibleDriver` from vendor configurations (OpenAI, Gemini, Ollama, OpenRouter, Groq, DeepSeek).

---

### 🔹 Milestone 2: 5-Stage Cognitive Reasoning Loop (Months 3–6)
- [ ] **Planner Subsystem**: Task decomposition & DAG execution plan generator.
- [ ] **Executor Subsystem**: Asynchronous tool runner & provider communicator.
- [ ] **Reflection Subsystem**: Error interception, schema audit, and self-correcting retry turns.
- [ ] **Summarizer Subsystem**: Working memory sliding window & context buffer compression.
- [ ] **SessionStore**: SQLite-backed session history (`sessions` & `messages` tables) replacing in-memory arrays.

---

### 🔹 Milestone 3: Hybrid Semantic Memory Engine (Months 6–9)
- [ ] **SQLite FTS5 Full-Text Search**: Fast in-database keyword search replacing in-JS array scans.
- [ ] **Vector Embedding Search**: `sqlite-vec` / cosine similarity integration powered by `provider.embed()`.
- [ ] **Recency & Relevance Scoring**: Hybrid ranking formula:
  $$\text{Score} = (w_1 \cdot \text{Vector} + w_2 \cdot \text{FTS5} + w_3 \cdot \text{Importance}) \cdot e^{-\lambda t}$$
- [ ] **User Profile Tier**: Pinned core preferences with zero time-decay ($\lambda = 0$).

---

### 🔹 Milestone 4: Plugin Ecosystem & OS Superpowers (Months 9–12)
- [ ] **RixiePlugin Architecture**: Dynamic plugin registry & lifecycle manager.
- [ ] **MCP Protocol Integration**: Connect external Model Context Protocol (MCP) servers.
- [ ] **Code Editing Plugin**: Line-range replacement, multi-file diff application, syntax check.
- [ ] **Image Gen Plugin**: Local ComfyUI / SD WebUI asset generation & background removal.
- [ ] **Voice & Audio Plugin**: ElevenLabs / WebSpeech TTS and Whisper STT.
- [ ] **Calendar & Email Plugins**: Studio task scheduling & email drafting (Tier 3 confirmation).

---

### 🔹 Milestone 5: Subagent Delegation & 2-Layer Telemetry UI (Year 2+)
- [ ] **Specialist Subagents**: Parallel subagent spawning for complex studio workflows (`spawn_subagent`, `send_message`).
- [ ] **2-Layer Console UI**: Modular React components (`AgentConsole`, `MessageStream`, `ToolTraceCard`).
- [ ] **Layer 2 Inspector Panel**: Full visualization of thinking tokens, memory recall scores, tool latencies, and turn/session API costs.
- [ ] **SSE Token Streaming**: Server-Sent Events for real-time typewriter feedback.
