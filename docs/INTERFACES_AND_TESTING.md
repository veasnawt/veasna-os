# Rixie Core Interfaces & Testing Strategy Specification

---

## 📐 1. Master System Interfaces

To ensure 10-year architectural stability, all workspace packages conform to these core TypeScript interface contracts:

### A. Provider Contract (`LLMProvider`)
```ts
export interface ProviderCapabilities {
  streaming: boolean;
  nativeToolCalling: boolean;
  structuredOutput: boolean;
  vision: boolean;
  embeddings: boolean;
  maxContextTokens: number;
}

export interface LLMProvider {
  id: string;
  name: string;
  capabilities: ProviderCapabilities;
  chat(options: ProviderChatOptions): Promise<ProviderResponse>;
  streamChat?(options: ProviderChatOptions): AsyncIterable<ProviderStreamChunk>;
  embed?(input: string | string[]): Promise<number[][]>;
}
```

---

### B. Memory Contract (`MemoryEngine`)
```ts
export interface MemoryItem {
  id: number;
  studio: string;
  kind: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  importance?: number;
}

export interface MemoryEngine {
  add(studio: string, kind: string, content: string, metadata?: Record<string, unknown>): number;
  search(query: string, studio?: string, limit?: number): MemoryItem[];
  hybridSearch(query: string, studio?: string, limit?: number): Promise<MemoryItem[]>;
}
```

---

### C. Plugin Contract (`RixiePlugin`)
```ts
export interface RixiePlugin {
  id: string;
  name: string;
  version: string;
  permissions?: PluginPermission[];
  tools: ProviderTool[];
  dispatch: Record<string, (input: any, context: PluginContext) => Promise<unknown>>;
  onInit?(context: PluginContext): Promise<void>;
  onShutdown?(): Promise<void>;
}
```

---

## 🧪 2. 3-Layer Testing Strategy

```
                              ┌───────────────────────────────┐
                              │    RIXIE TESTING STRATEGY     │
                              └───────────────┬───────────────┘
                                              │
       ┌──────────────────┬───────────────────┴───────────────────┬──────────────────┐
       ▼                  ▼                                       ▼                  ▼
┌──────────────┐   ┌──────────────┐                        ┌──────────────┐   ┌──────────────┐
│ TIER 1: UNIT │   │ TIER 2: INTEGRATION                   │ TIER 3: E2E  │   │ TIER 4: TYPE │
│ (Vitest/Jest)│   │ (Mock Providers)                      │ (VCR / Snap) │   │ (tsc check)  │
└──────────────┘   └──────────────┘                        └──────────────┘   └──────────────┘
```

---

### Tier 1: Unit Testing (Pure Functions & Tools)
- **Scope**: Tool dispatchers, memory ranking scoring formula, memory extractors, permission policy logic.
- **Execution**: Fast, isolated, in-memory execution (<100ms total suite run time). No network calls.

```ts
import { describe, it, expect } from "vitest";
import { extractMemories } from "../memory/extractor";

describe("extractMemories", () => {
  it("automatically extracts user brand preferences", async () => {
    const memoryStore = new MemoryStore(":memory:");
    const count = await extractMemories("I prefer 15-second video formats", "Got it!", "bp", memoryStore);
    expect(count).toBe(1);
    expect(memoryStore.search("15-second")[0].content).toContain("15-second");
  });
});
```

---

### Tier 2: Integration Testing (Mock Provider & Reasoning Pipeline)
- **Scope**: Testing the 5-stage `ReasoningPipeline` loop, Reflection auto-retries, and tool call traces using mock provider responses.

```ts
describe("ReasoningPipeline Integration", () => {
  it("auto-corrects tool errors via Reflection turn", async () => {
    const mockProvider = new MockSequenceProvider([
      { toolCalls: [{ id: "c1", name: "bad_tool", input: {} }] }, // Turn 1 fails reflection
      { text: "Corrected answer after retry." },                   // Turn 2 succeeds
    ]);

    const pipeline = new RixieReasoningPipeline({ provider: mockProvider });
    const result = await pipeline.execute("sess_1", "Run task");
    expect(result.reply).toBe("Corrected answer after retry.");
  });
});
```

---

### Tier 3: End-to-End (E2E) & Cassette Evaluation Testing
- **Scope**: Real API turns recorded to cassette snapshots (Nock/VCR) to verify LLM prompt outputs without incurring live API costs on every CI commit.

---

### Tier 4: Static Typecheck Verification
- **Scope**: Mandatory `tsc --noEmit` check across all workspace packages in CI/CD pipeline (`.github/workflows/ci.yml`).
