# Rixie Deep Technical Review: OpenAI Protocol & Memory System

---

## 1. OpenAI-Compatible Protocol Review

### Is the OpenAI-compatible protocol separated correctly?
**Verdict: Partially separated, but currently leaky.**

### What is Good:
- Using OpenAI's `/v1/chat/completions` JSON format as the standard REST wire protocol is the single best decision for industry compatibility (OpenAI, OpenRouter, Groq, DeepSeek, Local Ollama, vLLM, LM Studio).

### What is Wrong / Architectural Leaks:
1. **Inheritance Fallacy**: `GeminiProvider` and `OllamaProvider` instantiate `OpenAIProvider`. But `OpenAIProvider` hardcodes `"gpt-4o"` defaults and standard OpenAI headers.
2. **Missing Driver Separation**: We should separate the generic transport driver (`OpenAICompatibleDriver`) from specific vendor configurations.

### 10-Year Target Protocol Architecture:
```
                                 ┌──────────────────────────────┐
                                 │   OpenAICompatibleDriver     │
                                 │ (Generic REST / HTTP Client) │
                                 └──────────────┬───────────────┘
                                                │
       ┌──────────────────┬─────────────────────┼─────────────────────┬──────────────────┐
       ▼                  ▼                     ▼                     ▼                  ▼
┌──────────────┐   ┌──────────────┐      ┌──────────────┐      ┌──────────────┐   ┌──────────────┐
│ OpenAI       │   │ Ollama       │      │ Gemini       │      │ OpenRouter   │   │ DeepSeek     │
│ Provider     │   │ Provider     │      │ Provider     │      │ Provider     │   │ Provider     │
└──────────────┘   └──────────────┘      └──────────────┘      └──────────────┘   └──────────────┘
```

```ts
export class OpenAICompatibleDriver implements LLMProvider {
  constructor(
    public name: string,
    private config: {
      baseURL: string;
      apiKey: string;
      defaultModel: string;
      customHeaders?: Record<string, string>;
    }
  ) {}

  async chat(options: ProviderRequestOptions): Promise<ProviderResponse> {
    // Shared REST execution for ALL OpenAI-compatible endpoints
  }
}
```

---

## 2. Memory System Deep Review (Storage, Retrieval, Embeddings, Ranking)

### A. Storage Architecture
- **Current State**: Plain SQLite table (`memories`: `id`, `studio`, `kind`, `content`, `metadata`, `created_at`).
- **Flaws**:
  1. **Flat Bucket**: No `session_id` or `user_id` isolation. All studio memories go into a single unpartitioned table.
  2. **No Time-to-Live (TTL) or Memory Decay**: Memories remain forever without importance rating or archiving.
  3. **No Thread History**: Chat history is in an in-memory array rather than SQLite storage.

### B. Retrieval Engine
- **Current State**:
  ```ts
  // memoryStore.ts
  const rows = this.db.prepare("SELECT * FROM memories").all(); // LOADS ALL ROWS INTO JS!
  const scored = rows.map(row => ({ score: countKeywords(row), row }));
  ```
- **Critical Flaw**: **In-Memory Substring Scan**. Loading ALL memory database rows into JavaScript RAM on every turn will cause CPU spikes and memory exhaustion when storage reaches 10,000+ memories.
- **Fix**: Use SQLite's native `FTS5` (Full-Text Search 5) extension directly in SQL:
  ```sql
  SELECT *, rank FROM memories_fts WHERE content MATCH ? ORDER BY rank LIMIT 10;
  ```

### C. Embeddings Integration
- **Current State**: **Missing (0 Vector Support)**.
- **Critical Flaw**: Keyword search fails on semantic meaning.
  - *Example*: Memory stored: *"Prefer warm visual tones"*. User asks: *"What is my cinematic color style?"*. Keyword search returns **0 results**.
- **Fix**: Add **Hybrid Vector Search**:
  - `provider.embed(text)` generates vector arrays stored in a BLOB / `sqlite-vec` column.
  - Compute cosine similarity in SQL or via `sqlite-vec`.

### D. Memory Ranking Algorithm
- **Current State**: Plain count of matching query terms.
- **Flaw**: Ignores **Recency** (time decay), **Importance** (core preference vs trivia), and **Studio Relevance**.
- **Fix**: Implement a **10-Year Hybrid Scoring Formula**:

$$\text{FinalScore} = \left( w_1 \cdot \text{VectorSimilarity} + w_2 \cdot \text{FTS5Rank} + w_3 \cdot \text{Importance} \right) \times e^{-\lambda \cdot \Delta t}$$

```ts
export function calculateMemoryScore(
  memory: MemoryItem,
  vectorScore: number,
  ftsRank: number,
  now = Date.now()
): number {
  const ageInDays = (now - memory.createdAt * 1000) / (1000 * 60 * 60 * 24);
  const recencyDecay = Math.exp(-0.05 * ageInDays); // Exponential time decay
  const importance = (memory.metadata.importance as number) || 1.0;

  const hybridRelevance = 0.6 * vectorScore + 0.4 * ftsRank;
  return hybridRelevance * importance * recencyDecay;
}
```
