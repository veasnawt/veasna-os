# Rixie Observability & Telemetry Architecture

---

## 📊 Executive Observability Strategy

### Should reasoning, memory, tool calls, token usage, and costs be visualized?
**YES, 100% — via a 2-Layer Observability Design.**

In an AI Operating System, transparency into internal reasoning, memory recall, tool execution, token consumption, and API costs is vital for developer trust, cost management, and debugging.

However, dumping raw JSON telemetry directly into chat speech bubbles degrades readability.

---

## 🎨 The 2-Layer Observability Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ MAIN CHAT SURFACE (Layer 1 — Clean, Focused Co-creation)                 │
│                                                                         │
│ Agent: "I've drafted 3 video ideas and retrieved your color palette."   │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 💭 Thinking (1.2s) | 🧠 2 Memories | 🛠️ 1 Tool | ⚡ 412 Tokens ($0.002)│ │ (Collapsible Telemetry Bar)
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                   │ (Click to Expand)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ RIXIE TELEMETRY & INSPECTOR PANEL (Layer 2 — Deep Observability)        │
│                                                                         │
│ ┌───────────────────┬───────────────────┬─────────────────────────────┐ │
│ │ 🧠 Memory Engine  │ 🛠️ Tool Trace     │ 📊 Cost & Token Telemetry   │ │
│ │ Query: "short"    │ Tool: art_create  │ Input: 1,240 tokens         │ │
│ │ Score: 0.94       │ Args: {theme:...} │ Output: 180 tokens          │ │
│ │ Retrived: 2 items │ Latency: 120ms    │ Cost: $0.0024               │ │
│ └───────────────────┴───────────────────┴─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 The 5 Telemetry Pillars

### 1. Internal Reasoning & Thinking Tokens (💭)
- **Visualization**: Collapsible `Thought Process` accordion for reasoning models (Claude 3.7 Thinking, OpenAI `o1`/`o3`).
- **Telemetry Data**: `thinking_tokens`, `reasoning_time_ms`.

---

### 2. Memory Retrieval Telemetry (🧠)
- **Visualization**: Collapsible Memory Badge showing which items were pulled from `memory.db` and injected into context.
- **Telemetry Data**: `query`, `retrieved_items`, `similarity_scores`, `tier` (Episodic, Semantic, Profile).

---

### 3. Tool Execution & Latency (🛠️)
- **Visualization**: Monospace execution card with status indicator (Green = Success, Red = Error) and duration.
- **Telemetry Data**: `tool_name`, `input_args`, `execution_time_ms`, `output_preview`.

---

### 4. Token Usage & Turn Cost (⚡)
- **Visualization**: Compact token chip showing exact input/output breakdown and cost per turn.
- **Telemetry Data**:
  - `prompt_tokens`
  - `completion_tokens`
  - `cache_read_tokens`
  - `calculated_cost_usd`

---

### 5. Cumulative Session Cost Meter (💰)
- **Visualization**: Live counter badge in the top header showing total session expenditure.
- **Purpose**: Prevents runaway API bills during long automated multi-tool background loops.
