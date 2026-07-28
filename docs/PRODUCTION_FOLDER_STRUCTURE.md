# Complete Production-Ready Folder Structure for Rixie & Veasna OS

---

```text
veasna-os/
├── .github/                            # CI/CD Workflows & Automation
│   └── workflows/
│       ├── ci.yml                      # Linting, typecheck, unit tests
│       └── release.yml                 # Package publishing & deployment
│
├── docs/                               # Architecture Specs & Technical Specs
│   ├── ARCHITECTURE_REVIEW.md          # 10-Year Technical Audit
│   ├── MEMORY_TAXONOMY.md              # 4 Cognitive Memory Tiers
│   ├── AGENT_REDESIGN.md               # Multi-Agent & Orchestrator Design
│   ├── COGNITIVE_MODULES.md            # 5 Cognitive Subsystems Specification
│   ├── REASONING_LOOP.md               # Master Reasoning Pipeline Schema
│   ├── TOOL_SYSTEM_ARCHITECTURE.md     # MCP, OS Control & Multi-Studio Tools
│   ├── PLUGIN_AND_PERMISSION_ARCHITECTURE.md # Plugin System & 3-Tier Security
│   ├── UI_ARCHITECTURE_REVIEW.md       # Console UI Audit & Component Breakdown
│   ├── OBSERVABILITY_AND_TELEMETRY.md  # 2-Layer Telemetry & Inspector Specs
│   └── PRODUCTION_FOLDER_STRUCTURE.md  # Complete Monorepo Directory Layout
│
├── packages/                           # Core Framework & Engine Packages
│   │
│   ├── rixie-core/                     # Master Cognitive Engine & Loop
│   │   ├── src/
│   │   │   ├── agent/
│   │   │   │   ├── agent.ts            # High-level RixieAgent orchestrator
│   │   │   │   ├── reasoningLoop.ts    # Master 5-stage cognitive pipeline
│   │   │   │   ├── planner.ts          # Goal decomposition & DAG planner
│   │   │   │   ├── executor.ts         # Step runner & tool dispatcher
│   │   │   │   ├── reflection.ts       # Self-correction & quality audit
│   │   │   │   └── summarizer.ts       # Working memory sliding window
│   │   │   ├── plugins/
│   │   │   │   ├── pluginManager.ts    # Dynamic plugin registry & loader
│   │   │   │   └── types.ts            # RixiePlugin interface & context
│   │   │   ├── builder.ts              # Fluent RixieBuilder API
│   │   │   └── index.ts                # Core package entrypoint
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── rixie-providers/                # LLM Provider Adapters
│   │   ├── src/
│   │   │   ├── driver.ts               # Generic OpenAICompatibleDriver
│   │   │   ├── anthropic.ts            # Anthropic Claude 3.5 / 3.7 adapter
│   │   │   ├── openai.ts               # OpenAI GPT-4o adapter
│   │   │   ├── gemini.ts               # Google Gemini 2.0 adapter
│   │   │   ├── ollama.ts               # Local Ollama Llama3.1 adapter
│   │   │   ├── types.ts                # ProviderCapabilities & LLMProvider
│   │   │   └── index.ts                # Provider factory (createProvider)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── rixie-memory/                   # Hybrid Memory Engine
│   │   ├── src/
│   │   │   ├── store.ts                # SQLite database manager (memory.db)
│   │   │   ├── fts.ts                  # SQLite FTS5 Full-Text Search
│   │   │   ├── vector.ts               # Vector embedding similarity search
│   │   │   ├── ranker.ts               # Recency + Similarity scoring formula
│   │   │   ├── extractor.ts            # Automatic post-turn memory extractor
│   │   │   ├── types.ts                # MemoryItem, MemoryTier interfaces
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── rixie-security/                 # Security & Permission Manager
│   │   ├── src/
│   │   │   ├── manager.ts              # 3-Tier Permission Manager
│   │   │   ├── policy.ts               # Workspace security rules & whitelist
│   │   │   ├── types.ts                # PermissionLevel & PermissionRequest
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── rixie-plugins/                  # Core OS & System Plugins
│   │   ├── src/
│   │   │   ├── osTools.ts              # Filesystem, Terminal, Git, Search
│   │   │   ├── codeEditing.ts          # Multi-file patch & diff tools
│   │   │   ├── imageGen.ts             # Stable Diffusion / ComfyUI tools
│   │   │   ├── voiceAudio.ts           # TTS (ElevenLabs), STT (Whisper)
│   │   │   ├── calendar.ts             # Studio milestone scheduling
│   │   │   ├── email.ts                # Email drafting & prompt approval
│   │   │   ├── mcpAdapter.ts           # Model Context Protocol adapter
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── rixie-ui/                       # React Console & Telemetry Components
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── AgentConsole.tsx    # Root console layout
│   │   │   │   ├── ChatHeader.tsx      # Brand & Provider dropdown
│   │   │   │   ├── MessageStream.tsx   # Auto-scrolling chat history
│   │   │   │   ├── MessageBubble.tsx   # Speech bubble renderer
│   │   │   │   ├── ToolTraceCard.tsx   # Monospace execution card
│   │   │   │   ├── RichMediaCard.tsx   # Image, Audio & Video player
│   │   │   │   ├── PermissionModal.tsx # Interactive approval modal
│   │   │   │   └── InspectorPanel.tsx  # Layer 2 Telemetry Inspector
│   │   │   ├── hooks/
│   │   │   │   └── useRixieStream.ts   # SSE streaming React hook
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── rixie-cli/                      # Standalone Terminal REPL
│       ├── src/
│       │   ├── cli.ts                  # Interactive REPL main loop
│       │   └── commands.ts             # Slash commands (/provider, /status)
│       ├── package.json
│       └── tsconfig.json
│
├── studios/                            # Creative Studio Applications
│   ├── bp/                             # BP Studio (Short-Form Video Production)
│   │   ├── app/
│   │   │   ├── agent/page.tsx          # Rixie Console Page
│   │   │   ├── api/agent/route.ts      # Rixie Streaming API Route
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── tools/                      # BP-specific native tool definitions
│   │   ├── next.config.ts
│   │   └── package.json
│   │
│   ├── art/                            # Digital Art Studio App
│   ├── music/                          # Audio & Scoring Studio App
│   ├── games/                          # Game Dev Studio App
│   └── settings/                       # OS Settings & Configuration Hub
│
├── services/                           # Background Services & Daemons
│   ├── render-worker/                  # FFmpeg & video rendering daemon
│   └── websocket-gateway/              # Real-time reactive notification server
│
├── pnpm-workspace.yaml                 # Monorepo Workspace Config
├── tsconfig.base.json                  # Shared Base TypeScript Config
├── .gitignore
├── README.md
└── package.json                        # Monorepo Root
```
