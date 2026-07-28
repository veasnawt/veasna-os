# Rixie Executive Architectural Directives & Non-Negotiables

---

## 🚨 The 7 Non-Negotiable Directives

### 1. 🤖 Rixie Is Not a Chatbot
She is a persistent AI assistant, creative partner, operating system companion, and memory engine at the heart of Veasna OS. She operates directly within studio environments and executes actions, not just passive text advice.

---

### 2. 🔌 Absolute Provider Independence
Zero vendor lock-in. Rixie must maintain seamless runtime switching across Anthropic (`claude-sonnet-5`), OpenAI (`gpt-4o`), Google Gemini (`gemini-2.0-flash`), and local Ollama (`llama3.1`) without breaking state, history, or memory.

---

### 3. 🧩 Strict Open/Closed Plugin Decoupling
Core engine (`rixie-core`) must NEVER import studio-specific business logic or tools directly. Every studio capability (BP Studio, Digital Art, Music Studio, Game Dev, Code Editing, Voice, Calendar, Email) must be a self-contained **RixiePlugin**.

---

### 4. 🛡️ 3-Tier Security Guardrails
Never execute high-risk system commands (`os_run_command`), delete files, or send emails without explicit Tier 3 interactive user confirmation.

---

### 5. 📦 Minimal Dependencies & Pure TypeScript
Zero heavy framework bloat (no LangChain, LlamaIndex, AutoGen). Pure TypeScript + native Web APIs + local SQLite persistence (`better-sqlite3`).

---

### 6. 🔄 Resilient Self-Correcting Reasoning Loop
Runtime tool execution errors or malformed JSON from local models must trigger Reflection diagnostic turns and auto-retries cleanly without crashing the application process.

---

### 7. 📊 2-Layer Observability & Cost Control
Keep the main chat surface clean for creative co-creation, while providing deep telemetry (thinking tokens, memory recall scores, tool latencies, API turn costs) in the Layer 2 Inspector Panel.
