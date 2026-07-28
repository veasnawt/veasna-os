# Rixie Design Patterns & Architecture Catalog

---

## 🏛️ Design Patterns Catalog

To ensure long-term maintainability, clean separation of concerns, and zero technical debt over 10 years, Rixie is built using 7 classic Enterprise Software Design Patterns:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      RIXIE DESIGN PATTERNS CATALOG                      │
└─────────────────────────────────────────────────────────────────────────┘
  1. BUILDER PATTERN               ──► Fluent agent instantiation
  2. ADAPTER PATTERN               ──► Vendor-agnostic LLM translation
  3. STRATEGY PATTERN              ──► Dynamic provider & tool routing
  4. OBSERVER / EVENT BUS PATTERN  ──► Reactive telemetry & UI streaming
  5. CHAIN OF RESPONSIBILITY       ──► 3-Tier Security & Reasoning Pipeline
  6. PLUGIN PATTERN                ──► Open/Closed studio extension
  7. REPOSITORY PATTERN            ──► SQLite Memory & Session storage
```

---

## 1. Builder Pattern (`RixieBuilder`)

- **Purpose**: Provides a fluent, type-safe API for constructing configured instances of `RixieAgent`.
- **Implementation**:
  ```ts
  const agent = Rixie.builder()
    .withAnthropic("claude-sonnet-5")
    .withMemoryDb("./data/memory.db")
    .usePlugin(bpStudioPlugin)
    .usePlugin(osToolsPlugin)
    .build();
  ```

---

## 2. Adapter Pattern (`LLMProvider` Adapters)

- **Purpose**: Wraps disparate third-party LLM APIs (Anthropic, OpenAI, Gemini, Ollama) behind a single unified `LLMProvider` contract.
- **Implementation**:
  ```ts
  export interface LLMProvider {
    name: string;
    chat(options: ProviderRequestOptions): Promise<ProviderResponse>;
  }
  ```

---

## 3. Strategy Pattern (Dynamic Provider & Tool Selection)

- **Purpose**: Allows swapping LLM providers or filtering toolsets at runtime based on active studio context without altering the underlying agent loop.
- **Implementation**:
  ```ts
  agent.setProvider(new OpenAIProvider({ apiKey }));
  ```

---

## 4. Observer / Event Bus Pattern (`RixieEventBus`)

- **Purpose**: Emits real-time execution events (`thinking`, `memory_retrieved`, `tool_start`, `tool_end`, `telemetry`) to decoupled UI components, CLI spinners, and logging services.
- **Implementation**:
  ```ts
  agent.on("tool_end", (trace) => {
    uiStream.emit("tool_trace", trace);
  });
  ```

---

## 5. Chain of Responsibility Pattern (`ReasoningPipeline` & `PermissionManager`)

- **Purpose**: Processes conversation turns through a sequential pipeline of handlers (Security Verification ➔ Pre-turn Memory Retrieval ➔ Planning ➔ Execution ➔ Reflection Audit ➔ Post-turn Extraction).
- **Implementation**: If Reflection or PermissionManager rejects a request, execution halts or auto-corrects cleanly.

---

## 6. Plugin Pattern (`RixiePlugin`)

- **Purpose**: Enforces the Open/Closed Principle (Open for extension, Closed for modification). Studios and developers extend Rixie's tools without editing core code.
- **Implementation**:
  ```ts
  export interface RixiePlugin {
    id: string;
    tools: ProviderTool[];
    dispatch: Record<string, ToolFn>;
  }
  ```

---

## 7. Repository Pattern (`MemoryStore` & `SessionStore`)

- **Purpose**: Abstracts database operations (`memory.db`) behind clean TypeScript repository interfaces, preventing raw SQL queries from leaking into business logic.
- **Implementation**:
  ```ts
  const memories = memoryRepository.search("Khmer cooking", "bp", 5);
  ```
