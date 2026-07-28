# Rixie Logging & Diagnostics Specification

---

## 📜 Logging Philosophy

In an AI Operating System, logging must be **structured**, **context-aware**, **non-blocking**, and **privacy-preserving**. Log entries must provide complete observability into provider requests, tool dispatches, memory retrievals, and error tracebacks without leaking user secrets or API keys.

---

## 1. Structured JSON Log Schema (`RixieLogger`)

```ts
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogContext {
  service: string;        // e.g. "rixie-core", "rixie-providers", "rixie-memory"
  sessionId?: string;     // Active conversation thread ID
  studio?: string;        // Active creative studio (bp, art, music, gamedev)
  provider?: string;      // Active LLM provider (anthropic, openai, gemini, ollama)
  model?: string;         // Active model (claude-sonnet-5, gpt-4o)
  turnId?: string;        // Unique turn identifier
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;          // e.g. "tool_execution_start", "memory_retrieved", "provider_error"
  context: LogContext;
  data?: Record<string, unknown>;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
}
```

---

## 2. Automatic Secret & PII Redaction

The logger automatically redacts sensitive API keys and authorization tokens before writing to stdout or disk files:

```ts
const SECRET_REGEX = /(sk-ant-[a-zA-Z0-9_-]+|sk-[a-zA-Z0-9_-]{20,}|AIzaSy[a-zA-Z0-9_-]{33}|Bearer\s+[a-zA-Z0-9_.-]+)/gi;

export function redactSecrets(text: string): string {
  return text.replace(SECRET_REGEX, "[REDACTED_API_KEY]");
}
```

---

## 3. Multi-Transport Log Output

```
                              ┌───────────────────────────────┐
                              │         RIXIE LOGGER          │
                              └───────────────┬───────────────┘
                                              │
       ┌──────────────────┬───────────────────┼───────────────────┬──────────────────┐
       ▼                  ▼                   ▼                   ▼                  ▼
┌──────────────┐   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   ┌──────────────┐
│ STDOUT       │   │ ROTATING LOG │    │ INSPECTOR UI │    │ ERROR METRIC │   │ EVENT BUS    │
│ (Dev/Prod)   │   │ FILE         │    │ TELEMETRY    │    │ TELEMETRY    │   │ BUS          │
│              │   │ (rixie.log)  │    │ STREAM       │    │ DISPATCH     │   │ TRANSMISSION │
└──────────────┘   └──────────────┘    └──────────────┘    └──────────────┘   └──────────────┘
```

1. **Console Transport**: Colorized human-readable logs in development (`NODE_ENV=development`); structured single-line JSON in production.
2. **Rotating File Transport**: Writes logs to `./logs/rixie-YYYY-MM-DD.log` with automatic 14-day log retention cleanup.
3. **Inspector UI Stream**: Emits `info` and `debug` events to the React UI Console (`AgentConsole`).

---

## 4. Usage Specification

```ts
import { RixieLogger } from "@veasnawt/rixie-core";

const logger = new RixieLogger({ service: "rixie-core", studio: "bp" });

logger.info("tool_execution_start", { toolName: "bp_compose_script", input: { theme: "Khmer" } });

try {
  // Execute tool logic
} catch (err) {
  logger.error("tool_execution_failed", { toolName: "bp_compose_script" }, err as Error);
}
```
