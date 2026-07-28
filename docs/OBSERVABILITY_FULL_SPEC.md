# Rixie Complete Observability, Tracing & Telemetry Specification

---

## 📊 Observability Architecture Overview

In an AI Operating System, Observability is built on **3 Core Pillars**: **Distributed Tracing (Spans)**, **Metrics & Cost Tracking**, and **Live Telemetry Streaming**.

```
                          ┌────────────────────────────────┐
                          │   RIXIE OBSERVABILITY ENGINE   │
                          └───────────────┬───────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            │                             │                             │
    ┌───────▼───────┐             ┌───────▼───────┐             ┌───────▼───────┐
    │ DISTRIBUTED   │             │ METRICS & COST│             │ LIVE STREAM   │
    │ SPAN TRACING  │             │ COLLECTOR     │             │ INSPECTOR UI  │
    │ (OTel Spans)  │             │ (Tokens, USD) │             │ (Layer 2 UI)  │
    └───────────────┘             └───────────────┘             └───────────────┘
```

---

## 1. Distributed Span Tracing (`RixieTracer`)

Every turn executed by Rixie generates a root `TraceContext` with nested child spans:

```ts
export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;           // e.g. "llm_inference", "memory_search", "tool_execution"
  startTime: number;
  endTime?: number;
  durationMs?: number;
  attributes: Record<string, unknown>;
  status: "ok" | "error";
}

export class RixieTracer {
  startSpan(name: string, attributes?: Record<string, unknown>): TraceSpan { ... }
  endSpan(span: TraceSpan, status: "ok" | "error" = "ok"): void { ... }
}
```

### Trace Span Hierarchy per Turn:
```text
Root Turn Span: "turn_execution" (trace_id: "tr_891f42")
├── Child Span 1: "memory_retrieval" (duration: 18ms, items: 3, score_avg: 0.92)
├── Child Span 2: "llm_inference" (provider: "anthropic", model: "claude-sonnet-5", duration: 1,240ms)
├── Child Span 3: "tool_execution" (tool: "art_create_palette", duration: 45ms, status: "ok")
└── Child Span 4: "memory_auto_extract" (duration: 12ms, extracted: 1)
```

---

## 2. Real-Time Metrics & API Cost Collector

Tracks cumulative token usage and monetary cost per provider and model:

```ts
export interface TokenCostRates {
  promptTokenCostPer1M: number;
  completionTokenCostPer1M: number;
}

export const PROVIDER_COST_TABLE: Record<string, TokenCostRates> = {
  "claude-sonnet-5": { promptTokenCostPer1M: 3.0, completionTokenCostPer1M: 15.0 },
  "gpt-4o": { promptTokenCostPer1M: 2.5, completionTokenCostPer1M: 10.0 },
  "gemini-2.0-flash": { promptTokenCostPer1M: 0.1, completionTokenCostPer1M: 0.4 },
  "llama3.1": { promptTokenCostPer1M: 0.0, completionTokenCostPer1M: 0.0 }, // Local free
};

export function calculateTurnCost(model: string, promptTokens: number, completionTokens: number): number {
  const rates = PROVIDER_COST_TABLE[model] || { promptTokenCostPer1M: 0, completionTokenCostPer1M: 0 };
  const promptCost = (promptTokens / 1_000_000) * rates.promptTokenCostPer1M;
  const completionCost = (completionTokens / 1_000_000) * rates.completionTokenCostPer1M;
  return promptCost + completionCost;
}
```

---

## 3. Live Telemetry Inspector UI Stream

Emits structured telemetry events directly to `AgentConsole` for Layer 2 visualization:

```ts
export interface TelemetryEvent {
  type: "span" | "metric" | "log";
  traceId: string;
  timestamp: number;
  payload: unknown;
}
```
