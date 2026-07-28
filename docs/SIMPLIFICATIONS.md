# Rixie Simplification & Complexity Elimination Architecture

---

## 🎯 Simplification Philosophy

Complexity is the enemy of 10-year maintainability. Every line of code, every extra abstraction, and every unnecessary npm dependency is a liability. 

Below are 4 radical simplifications applied to `packages/rixie-core` that eliminate accidental complexity while maximizing performance and developer experience.

---

## 1. Simplification 1: Generic `OpenAICompatibleDriver` (Cuts 250+ Lines)

### Before (Duplicated Provider Files):
`openai.ts`, `gemini.ts`, `ollama.ts`, `openrouter.ts`, `groq.ts`, `deepseek.ts` each contained full HTTP fetch loops, header handling, JSON body construction, and error parsing.

### After (Single Generic Driver):
One single 40-line `OpenAICompatibleDriver` class handles ALL OpenAI-compatible REST endpoints. Custom providers are just configuration objects:

```ts
export class OpenAICompatibleDriver implements LLMProvider {
  constructor(
    public name: string,
    private config: {
      baseURL: string;
      apiKey?: string;
      defaultModel: string;
      customHeaders?: Record<string, string>;
    }
  ) {}

  async chat(options: ProviderRequestOptions): Promise<ProviderResponse> {
    // 1 Shared REST Execution for OpenAI, Gemini, Ollama, OpenRouter, Groq, DeepSeek
  }
}

// Preset Provider Factories:
export const createOllamaProvider = (model = "llama3.1") =>
  new OpenAICompatibleDriver("Ollama", { baseURL: "http://localhost:11434/v1", defaultModel: model });

export const createGeminiProvider = (apiKey: string, model = "gemini-2.0-flash") =>
  new OpenAICompatibleDriver("Gemini", {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey,
    defaultModel: model,
  });
```

---

## 2. Simplification 2: Unified SQLite Table with Native `FTS5` (Zero Extra Tables)

### Before (Complex Multi-Table Graph Schemes):
Over-engineered multi-table schemas (`nodes`, `edges`, `relationships`, `tags`) requiring complex SQL joins.

### After (Single Table + Native FTS5 Trigger):
Keep SQLite storage to **ONE simple table** (`memories`), but attach SQLite's native `FTS5` virtual table directly to it:

```sql
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studio TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

-- Native SQLite FTS5 Virtual Table for Instant Search
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(content, studio, kind, content='memories', content_rowid='id');

-- Auto-sync Triggers (Zero JS overhead)
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, studio, kind) VALUES (new.id, new.content, new.studio, new.kind);
END;
```

---

## 3. Simplification 3: Plain Functions & Tool Modules (No Heavy Class Hierarchies)

### Before (Class Inheritances):
`AbstractToolModule`, `BaseProviderAdapter`, `ConfigurableRegistryClass`.

### After (Pure Functions & Interfaces):
A tool module is simply a pure function returning `{ schemas: ToolSchema[], dispatch: Record<string, ToolFn> }`. No classes, no inheritance, no `super()` calls.

---

## 4. Simplification 4: 1-Line `Rixie.chat()` Convenience Shortcut

### Before (Verbose Multi-Step Setup):
```ts
const provider = createProvider();
const store = new MemoryStore();
const agent = new RixieAgent({ provider, memoryDbPath: "./data/memory.db" });
const result = await agent.chat("Prompt");
```

### After (1-Line Executable Shortcut):
```ts
const result = await Rixie.chat("Draft 3 short video concepts for BP Studio");
```
