# Rixie Error Handling & Resiliency Specification

---

## ⚡ Error Handling Philosophy

In an AI Operating System, runtime errors (API timeouts, tool failure, malformed JSON, permission rejection) are **expected events**, not fatal process crashes. Error handling must be **resilient**, **self-correcting**, **typed**, and **zero-bloat**.

---

## 1. Domain Error Hierarchy (`RixieError`)

All custom errors in Rixie inherit from `RixieError`:

```ts
export class RixieError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "RixieError";
  }
}

export class ProviderError extends RixieError {
  constructor(message: string, public readonly provider: string, details?: Record<string, unknown>) {
    super(message, "PROVIDER_ERROR", 502, details);
    this.name = "ProviderError";
  }
}

export class ToolExecutionError extends RixieError {
  constructor(message: string, public readonly toolName: string, details?: Record<string, unknown>) {
    super(message, "TOOL_EXECUTION_ERROR", 400, details);
    this.name = "ToolExecutionError";
  }
}

export class PermissionDeniedError extends RixieError {
  constructor(message: string, public readonly toolName: string, public readonly level: string) {
    super(message, "PERMISSION_DENIED", 403, { toolName, level });
    this.name = "PermissionDeniedError";
  }
}
```

---

## 2. Self-Correction & Reflection Recovery Flow

```
┌────────────────────────────────┐
│       Tool Execution           │ ── (Throws ToolExecutionError) ──┐
└────────────────────────────────┘                                  │
                                                                    ▼
┌────────────────────────────────┐                        ┌───────────────────┐
│     Reflection Subsystem       │ ◄───────────────────── │ Intercept Error   │
│ (Formats Diagnostic Feedback)  │                        └───────────────────┘
└───────────────┬────────────────┘
                │
                ▼
┌────────────────────────────────┐
│   Auto-Corrected Retry Turn    │ ── (Re-invokes Tool cleanly with corrected args)
└────────────────────────────────┘
```

When a tool fails:
1. **Interception**: `Reflection` catches `ToolExecutionError`.
2. **Diagnostic Feedback**: Formats feedback (`"Tool 'art_create_palette' failed: 'colors' array cannot be empty. Please provide an array of hex strings."`).
3. **Auto-Retry**: Rixie auto-corrects the input arguments and re-executes without user intervention.

---

## 3. Provider Failover & Circuit Breaker

If an LLM provider fails due to rate limits (HTTP 429) or outage (HTTP 503):

```ts
export class ProviderCircuitBreaker {
  async executeWithFallback(
    primaryProvider: LLMProvider,
    fallbackProvider: LLMProvider | undefined,
    request: ProviderChatOptions
  ): Promise<ProviderResponse> {
    try {
      return await primaryProvider.chat(request);
    } catch (err) {
      if (fallbackProvider && this.isRetriableProviderError(err)) {
        logger.warn("primary_provider_failed_using_fallback", { primary: primaryProvider.name, fallback: fallbackProvider.name });
        return await fallbackProvider.chat(request);
      }
      throw err;
    }
  }
}
```

---

## 4. User-Facing Error Formatting

Errors sent to the UI console are stripped of raw stack traces and formatted into actionable UI alerts:

```ts
export interface UserFacingError {
  title: string;
  message: string;
  code: string;
  actionHint?: string;
}

export function formatUserFacingError(err: unknown): UserFacingError {
  if (err instanceof PermissionDeniedError) {
    return {
      title: "Permission Required",
      message: `Tool '${err.toolName}' requires ${err.level} authorization.`,
      code: err.code,
      actionHint: "Approve the request in the console prompt.",
    };
  }
  if (err instanceof ProviderError) {
    return {
      title: "AI Provider Error",
      message: err.message,
      code: err.code,
      actionHint: "Check your API key or try switching providers in the header.",
    };
  }
  return {
    title: "Unexpected Error",
    message: err instanceof Error ? err.message : String(err),
    code: "INTERNAL_ERROR",
  };
}
```
