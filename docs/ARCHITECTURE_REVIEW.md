# Rixie Architecture 10-Year Deep Technical Audit & Review

**Author**: Lead Architect of Rixie  
**System**: Veasna OS (`packages/rixie-core`)  
**Scope**: Provider Architecture, Agent Design, Memory System, Tool Architecture, OS Concepts & Longevity  

---

## Executive Summary

Rixie has achieved a strong V1 foundation: provider independence, persistent SQLite memory, dynamic UI/CLI provider switching, and clean TypeScript code with minimal dependencies.

However, to scale Rixie as the **10-year AI Operating System for Veasna OS**, several foundational abstractions must be refactored before technical debt hardens. This document presents a brutally honest architectural critique and concrete 10-year blueprint.

---

## 1. Specifically Reviewing: The Provider System

### Current State
`LLMProvider` is a single-method interface:
```ts
export interface LLMProvider {
  name: string;
  chat(options: ProviderRequestOptions): Promise<ProviderResponse>;
}
```

### Brutally Honest Critique
1. **Blocking Monolithic `chat()`**: Blocking until full response completion prevents real-time token streaming, causing perceived UI lag during multi-step reasoning.
2. **Missing `embed()` Capabilities**: Memory search is currently forced to use naive SQL `LIKE` substring matches or JS regex because the provider layer cannot generate vector embeddings.
3. **No Capability Detection**: Models differ vastly (Native Tool Calling vs. Prompted Tools, Multimodal Vision, Structured Outputs, Context Window Size, Reasoning/Thinking Tokens). Treating all providers identically causes silent runtime failures (e.g. when using smaller local Ollama models with no native tool-calling support).

### 10-Year Target Architecture for Providers

```ts
export interface ProviderCapabilities {
  streaming: boolean;
  nativeToolCalling: boolean;
  structuredOutput: boolean;
  vision: boolean;
  embeddings: boolean;
  thinkingTokens: boolean;
  maxContextTokens: number;
}

export interface ProviderChatOptions {
  model: string;
  systemPrompt?: string;
  maxTokens?: number;
  messages: ProviderMessage[];
  tools?: ProviderTool[];
  temperature?: number;
  responseFormat?: "text" | "json";
}

export interface ProviderStreamChunk {
  deltaText?: string;
  toolCallDeltas?: Array<{ id: string; name?: string; inputDelta?: string }>;
  finishReason?: "stop" | "tool_calls" | "length";
}

export interface LLMProvider {
  id: string;
  name: string;
  capabilities: ProviderCapabilities;

  // Turn-based execution
  chat(options: ProviderChatOptions): Promise<ProviderResponse>;

  // Token streaming execution
  streamChat(options: ProviderChatOptions): AsyncIterable<ProviderStreamChunk>;

  // Vector embeddings for hybrid semantic memory
  embed?(input: string | string[]): Promise<number[][]>;
}
```

---

## 2. What Is Designed Well

1. **Zero-Bloat Dependency Model**: No heavy, fragile frameworks (LangChain, LlamaIndex, AutoGen). Pure TypeScript + SQLite (`better-sqlite3`). Fast, stable, instant startup.
2. **Universal Standardized Message & Tool Schema**: Translates vendor-specific tool shapes (Anthropic `input_schema` vs. OpenAI `parameters`) seamlessly inside provider adapters.
3. **Persistent SQLite Memory Engine**: Storing memory in plain local SQLite (`memory.db`) ensures zero cloud dependency, low latency, and cross-session persistence.
4. **Dynamic Provider Switching at Runtime**: UI dropdown and CLI slash commands change providers without restarting process state.

---

## 3. What Should Be Redesigned

### A. Dynamic Plugin / Tool Registration (Decouple Studios from Core)
- **Current Issue**: `rixie-core` directly imports studio tools (`registerBpStudioTools`, `registerArtStudioTools`, etc.). This violates Open/Closed Principle.
- **Redesign**: Core OS should have a **Plugin Registry API**. Studios register tools dynamically:
```ts
rixie.usePlugin(bpStudioPlugin);
rixie.usePlugin(artStudioPlugin);
```

### B. Conversation Session & History Management
- **Current Issue**: `this.history` is an in-memory array inside `RixieAgent`. In serverless Next.js API routes, history is lost between requests unless managed manually.
- **Redesign**: Abstract history behind a `SessionStore` backed by SQLite threads (`sessions` and `messages` tables).

### C. Hybrid Semantic Memory (Embeddings + Keyword)
- **Current Issue**: `memoryStore.search()` uses naive substring keyword matching.
- **Redesign**: Upgrade `MemoryStore` to hybrid search (Vector cosine similarity via local/provider embeddings + SQLite FTS5 full-text search).

---

## 4. What Should Be Separated into Packages (Monorepo Refactoring)

To support 10-year maintainability, break `packages/rixie-core` into modular workspace packages:

```
packages/
├── rixie-core/          # Agent Loop, Tool Registry, Plugin System
├── rixie-providers/     # Anthropic, OpenAI, Gemini, Ollama Adapters
├── rixie-memory/        # SQLite + Vector Hybrid Memory Store
├── rixie-ui/            # React AgentChat Console Component
└── rixie-cli/           # Standalone Terminal REPL
```

---

## 5. Naming Smells & Wrong Abstractions

| Current Name / Pattern | Refactored Name | Reason |
| :--- | :--- | :--- |
| `buildToolset()` | `ToolRegistry` / `PluginManager` | `buildToolset` sounds like a build script step rather than a runtime registry. |
| `otherStudioTools.ts` | Discard / Studio Packages | Generic catch-all file smells like technical debt. Each studio owns its tools. |
| `extractor.ts` Regex | `MemoryExtractor` LLM / Rules Engine | Pure regex misses 90% of implicit creative decisions and preferences. |
| `RixieAgent.history` | `RixieSession` | In-memory array confuses instance lifecycle with conversation session lifecycle. |

---

## 6. Future Problems Predicted (3 to 10 Year Horizon)

1. **Context Window Overflow**: As session history grows, sending full un-summarized message history will blow past model context limits or spike API costs. **Solution**: Context sliding window + automatic conversation summarization.
2. **Tool Collision & Hallucination**: As studio tools scale from 10 to 100+, passing all 100 tool schemas in every prompt degrades LLM reasoning. **Solution**: Dynamic Tool Routing (only pass tools relevant to active studio/context).
3. **Local LLM Tool Quality**: Smaller Ollama models (7B/8B) often output malformed JSON for function calls. **Solution**: Provider fallback parser that extracts JSON tool calls from plain text outputs.
