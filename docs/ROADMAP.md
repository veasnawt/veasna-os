# Rixie Architectural Roadmap

## Phase 1: Foundation (Current Status — Completed)
- [x] **Provider Abstraction**: Anthropic, OpenAI, Google Gemini, Ollama, OpenRouter.
- [x] **Dynamic Provider Switching**: Real-time selection via UI dropdown and CLI slash commands.
- [x] **Persistent SQLite Memory**: Central `memory.db` shared across all sessions and providers.
- [x] **Programmatic SDK API**: Builder pattern (`Rixie.builder()`) and factory methods.
- [x] **Studio Tool Registry**: BP Studio, Art, Music, and Game Dev tool dispatchers.

---

## Phase 2: Claude Code Capabilities (Workspace & Execution Engine)
- [ ] **Filesystem Access Tools**: `read_file`, `write_file`, `list_directory`, `search_files` inside `veasna-os`.
- [ ] **Safe Shell Execution Tool**: Run studio build scripts, FFmpeg video processing, and asset compilers.
- [ ] **AST & Code Inspection**: Parse and edit studio configurations and project files directly.
- [ ] **Self-Correcting Tool Loop**: Automatic error diagnosis and retry logic on tool failures.

---

## Phase 3: Jarvis Capabilities (Proactive System & Ambient Control)
- [ ] **Background Task & Cron Scheduler**: Execute background jobs (rendering, audio scoring) with notification timers.
- [ ] **Subagent Spawning**: Spawn specialist subagents (e.g. Video Editing Subagent, Music Composition Subagent) running concurrently.
- [ ] **OS Environment Diagnostics**: Monitor system resources, GPU/CPU usage, disk space, and studio health.

---

## Phase 4: Hybrid Semantic Memory Engine
- [ ] **Vector Embeddings**: Hybrid SQLite keyword + vector similarity search (e.g. via local embedding model or API).
- [ ] **Creative Knowledge Graph**: Node-graph connecting assets across studio boundaries (Scene ➔ Song ➔ Art ➔ Code).
- [ ] **Automated Memory Summarization**: Periodic consolidation of chat history into long-term core memory.

---

## Phase 5: Multi-Modal Studio Co-Creation
- [ ] **Visual Studio Preview**: Direct image generation and canvas manipulation inside `AgentChat`.
- [ ] **Audio Score Listening**: Process and generate audio previews directly from Music Studio tools.
- [ ] **BP Video Pipeline**: Full script-to-rendered-video autonomous pipeline trigger.
