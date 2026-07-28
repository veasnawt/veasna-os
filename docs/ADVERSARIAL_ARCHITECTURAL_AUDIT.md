# Adversarial Architectural Audit: Hard Truths About Current Rixie Core

---

## 💥 Executive Critique

You requested a brutally honest architectural review without superficial validation or simple agreement. Here is the unvarnished engineering critique of the current implementation in `packages/rixie-core`.

While V1 successfully proved provider independence and SQLite storage, **5 critical architectural flaws will cause system failure at scale if not refactored**.

---

## 1. 🚨 Memory Engine Will Choke at 5,000 Items (Severe RAM/CPU Flaw)

### Current Implementation:
```ts
// memoryStore.ts
const rows = this.db.prepare("SELECT * FROM memories").all(); // LOADS ALL ROWS INTO JS RAM!
const scored = rows.map(row => ({ score: countKeywords(row), row }));
```

### Unvarnished Critique:
- **Why it breaks**: Every single user turn loads **100% of all memory rows** from SQLite disk into Node.js heap memory, then runs a JavaScript `.reduce()` loop over every string.
- **The Impact**: With 20 test memories, it takes 1ms. With 5,000 memories after 6 months of daily studio work, every chat message will freeze the Node.js event loop for 300ms+, spike RAM usage, and degrade performance.
- **Non-Negotiable Fix**: Stop loading rows into JavaScript. Use SQLite's native `FTS5` (Full-Text Search) module directly in SQL:
  ```sql
  SELECT *, rank FROM memories_fts WHERE content MATCH ? ORDER BY rank LIMIT 10;
  ```

---

## 2. 🚨 In-Memory History Array Breaks in Next.js Serverless Routes

### Current Implementation:
```ts
// agent.ts
private history: ProviderMessage[] = [];
```

### Unvarnished Critique:
- **Why it breaks**: Next.js API routes (`app/api/agent/route.ts`) are stateless handlers. Every HTTP request re-instantiates `RixieAgent`, initializing `history` as `[]`.
- **The Impact**: Multi-turn conversation context is wiped between HTTP requests unless the client sends the entire history array on every POST request (wasting bandwidth and breaking server authority).
- **Non-Negotiable Fix**: Move conversation history out of class RAM into an SQLite-backed `SessionStore` (`sessions` and `messages` tables).

---

## 3. 🚨 Core Engine Violates Open/Closed Principle (Tight Studio Coupling)

### Current Implementation:
```ts
// toolsRegistry.ts
import { registerBpStudioTools } from "../tools/bpStudioTools";
import { registerArtStudioTools } from "../tools/artStudioTools";
import { registerMusicStudioTools } from "../tools/musicStudioTools";
import { registerGamedevStudioTools } from "../tools/gamedevStudioTools";
```

### Unvarnished Critique:
- **Why it breaks**: Core OS (`rixie-core`) directly imports every studio's tool file.
- **The Impact**: Adding a new studio or third-party tool requires editing core engine source code! This creates tight coupling and monolithic fragility.
- **Non-Negotiable Fix**: `rixie-core` must expose a pure `PluginManager` plugin registry (`rixie.usePlugin(plugin)`). Core engine must know NOTHING about specific studios.

---

## 4. 🚨 Non-Streaming `chat()` Causes Terrible User Experience on Long Turns

### Current Implementation:
```ts
// agent.ts
const response = await this.provider.chat(...); // BLOCKS UNTIL COMPLETE
```

### Unvarnished Critique:
- **Why it breaks**: A complex turn with 3 tool executions and script generation takes 8–12 seconds on Claude 3.5 / 3.7 or Sonnet 5.
- **The Impact**: The user stares at a dead UI spinner for 12 seconds with zero visual feedback.
- **Non-Negotiable Fix**: Upgrade `LLMProvider` to support token streaming via `streamChat(): AsyncIterable<ProviderStreamChunk>` and Server-Sent Events (SSE).

---

## 5. 🚨 Zero Security Guardrails (Critical Vulnerability)

### Current Implementation:
```ts
// osSystemTools.ts
os_run_command: async (input) => { execAsync(input.command); }
```

### Unvarnished Critique:
- **Why it breaks**: Tools execute shell commands immediately with full process privileges without authorization.
- **The Impact**: If an LLM hallucination or prompt injection outputs a dangerous command (`rm -rf`, `git reset --hard`), Rixie will execute it instantly without asking the user.
- **Non-Negotiable Fix**: Implement a 3-Tier `PermissionManager` requiring explicit user confirmation before executing any Tier 3 system command.
