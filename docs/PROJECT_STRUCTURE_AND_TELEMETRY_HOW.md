# Rixie 10-Year Monorepo Project Structure & Telemetry Implementation

---

## 📁 1. The 10-Year Monorepo Directory Structure

To ensure long-term maintainability, clean boundaries, and zero circular dependencies, `veasna-os` is structured into decoupled, single-responsibility workspace packages:

```
veasna-os/
├── docs/                             # Architecture Specs & Roadmaps
│   ├── ARCHITECTURE_REVIEW.md
│   ├── MEMORY_TAXONOMY.md
│   ├── AGENT_REDESIGN.md
│   ├── COGNITIVE_MODULES.md
│   ├── REASONING_LOOP.md
│   ├── TOOL_SYSTEM_ARCHITECTURE.md
│   ├── PLUGIN_AND_PERMISSION_ARCHITECTURE.md
│   ├── UI_ARCHITECTURE_REVIEW.md
│   ├── OBSERVABILITY_AND_TELEMETRY.md
│   └── PROJECT_STRUCTURE_AND_TELEMETRY_HOW.md
│
├── packages/                         # Modular Framework Packages
│   ├── rixie-core/                   # Agent Reasoning Loop, Plugin Manager, Event Bus
│   ├── rixie-providers/              # LLM Providers (Anthropic, OpenAI, Gemini, Ollama, OpenRouter)
│   ├── rixie-memory/                 # SQLite + Vector Hybrid Memory Store & Extractor
│   ├── rixie-plugins/                # Core Plugins (OS Tools, Code Editing, ImageGen, Voice, Calendar, Email)
│   ├── rixie-ui/                     # React Agent Console, Telemetry Inspector & UI Components
│   └── rixie-cli/                    # Standalone Interactive REPL CLI
│
├── studios/                          # Creative Studio Applications
│   ├── bp/                           # BP Studio (Short-Form Video Production)
│   ├── art/                          # Digital Art Studio
│   ├── music/                        # Audio & Music Scoring Studio
│   ├── games/                        # Game Dev Engine & Studio
│   └── settings/                     # OS Configuration & Settings Hub
│
├── pnpm-workspace.yaml               # Monorepo Workspace Configuration
└── package.json                      # Workspace Root
```

---

## 💻 2. How Telemetry & Visualization Work in Code

### Telemetry Data Contract (`TurnTelemetry`)

```ts
export interface TurnTelemetry {
  id: string;
  timestamp: number;
  provider: string;
  model: string;
  reasoningTimeMs?: number;
  thinkingText?: string;
  memory: {
    retrieved: Array<{
      id: number;
      studio: string;
      kind: string;
      content: string;
      similarityScore: number;
    }>;
  };
  tools: Array<{
    name: string;
    input: unknown;
    output: unknown;
    durationMs: number;
    status: "success" | "error";
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
}
```

---

### Telemetry Flow in API & UI

```
┌────────────────────────────────┐
│   Rixie Reasoning Pipeline     │ ── (emits TurnTelemetry) ──┐
└────────────────────────────────┘                           │
                                                             ▼
┌────────────────────────────────┐                 ┌────────────────────┐
│      Next.js API Route         │ ◄── (SSE Stream)┤ POST /api/agent    │
└────────────────────────────────┘                 └────────────────────┘
                                                             │
                                                             ▼
┌────────────────────────────────┐                 ┌────────────────────┐
│   React UI Console Surface     │                 │ Rixie Inspector    │
│   (Renders speech bubbles)     │                 │ (Renders telemetry)│
└────────────────────────────────┘                 └────────────────────┘
```

1. **Reasoning Loop Execution**: As Rixie executes a turn, `ReasoningPipeline` populates a `TurnTelemetry` object.
2. **API Route Transmission**: `POST /api/agent` streams response text AND `telemetry` payload back to the client.
3. **UI Rendering**: `AgentChatConsole` renders clean speech bubbles on the main chat surface, while passing `telemetry` to `RixieInspectorPanel` for collapsible deep inspection.
