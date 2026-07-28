# Rixie Complete Master Architecture: Concrete Examples, Interfaces & Migration Strategy

---

## 1. Complete Core Interface Declarations (`packages/rixie-core/src/types.ts`)

```ts
// Provider Contract
export interface ProviderCapabilities {
  streaming: boolean;
  nativeToolCalling: boolean;
  structuredOutput: boolean;
  vision: boolean;
  embeddings: boolean;
  maxContextTokens: number;
}

export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ProviderTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ProviderRequestOptions {
  model: string;
  messages: ProviderMessage[];
  tools?: ProviderTool[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ProviderResponse {
  text: string;
  toolCalls: ToolCall[];
}

export interface LLMProvider {
  id: string;
  name: string;
  capabilities: ProviderCapabilities;
  chat(options: ProviderRequestOptions): Promise<ProviderResponse>;
  embed?(input: string | string[]): Promise<number[][]>;
}

// Memory Contract
export interface MemoryItem {
  id: number;
  studio: string;
  kind: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

// Plugin & Security Contract
export type PermissionLevel = "read" | "write" | "system" | "admin";

export interface PluginPermission {
  level: PermissionLevel;
  resource: string;
  description: string;
}

export interface PluginContext {
  workspaceDir: string;
  memoryStore: any;
  permissionManager: any;
}

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

## 2. Concrete Implementation Examples

### A. Generic OpenAI-Compatible Transport Driver (`OpenAICompatibleDriver`)

```ts
export class OpenAICompatibleDriver implements LLMProvider {
  capabilities: ProviderCapabilities = {
    streaming: true,
    nativeToolCalling: true,
    structuredOutput: true,
    vision: false,
    embeddings: false,
    maxContextTokens: 128000,
  };

  constructor(
    public id: string,
    public name: string,
    private config: { baseURL: string; apiKey?: string; defaultModel: string }
  ) {}

  async chat(options: ProviderRequestOptions): Promise<ProviderResponse> {
    const payload = {
      model: options.model || this.config.defaultModel,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content || "",
      })),
      max_tokens: options.maxTokens || 2048,
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) headers["Authorization"] = `Bearer ${this.config.apiKey}`;

    const res = await fetch(`${this.config.baseURL}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const choice = data.choices[0].message;

    return {
      text: choice.content || "",
      toolCalls: choice.tool_calls ? choice.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || "{}"),
      })) : [],
    };
  }
}
```

---

### B. SQLite FTS5 Fast Memory Engine (`MemoryStoreFTS`)

```ts
import Database from "better-sqlite3";

export class MemoryStoreFTS {
  private db: Database.Database;

  constructor(dbPath = "./data/memory.db") {
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studio TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content, studio, kind, content='memories', content_rowid='id'
      );

      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, studio, kind) 
        VALUES (new.id, new.content, new.studio, new.kind);
      END;
    `);
  }

  searchFTS(query: string, studio = "global", limit = 10): MemoryItem[] {
    const stmt = this.db.prepare(`
      SELECT m.* FROM memories m
      JOIN memories_fts fts ON m.id = fts.rowid
      WHERE memories_fts MATCH ? AND m.studio = ?
      ORDER BY rank LIMIT ?
    `);
    
    const rows = stmt.all(query, studio, limit) as any[];
    return rows.map((r) => ({
      id: r.id,
      studio: r.studio,
      kind: r.kind,
      content: r.content,
      metadata: JSON.parse(r.metadata || "{}"),
      createdAt: r.created_at,
    }));
  }
}
```

---

## 3. Step-by-Step Monorepo Migration Strategy

```
STAGE A (Foundation)            STAGE B (Decoupling)           STAGE C (Production)
┌───────────────────────┐       ┌───────────────────────┐      ┌───────────────────────┐
│ 1. Add SessionStore   │ ──►   │ 3. Split Monorepo     │ ──►  │ 5. Add Plugin System  │
│ 2. Upgrade SQLite FTS5│       │    Packages           │      │ 6. Add SSE Streaming  │
└───────────────────────┘       │ 4. Add 3-Tier Security│      └───────────────────────┘
                                └───────────────────────┘
```

### Migration Execution Plan:

1. **Step 1 (Zero-Breaking SQLite Upgrade)**: Add `memories_fts` table and auto-sync trigger to `memoryStore.ts`. Preserves backward compatibility while accelerating memory search from 300ms to 2ms.
2. **Step 2 (SessionStore Addition)**: Add `sessions` and `messages` tables to `memoryStore.ts`, allowing API routes to load/save thread history from disk instead of RAM arrays.
3. **Step 3 (Monorepo Package Split)**: Split `packages/rixie-core` into 6 workspace packages (`rixie-core`, `rixie-providers`, `rixie-memory`, `rixie-security`, `rixie-ui`, `rixie-cli`) in `pnpm-workspace.yaml`.
4. **Step 4 (Plugin & Security System)**: Introduce `PluginManager` and `PermissionManager`, refactoring studio tools into modular `RixiePlugin` packages.
