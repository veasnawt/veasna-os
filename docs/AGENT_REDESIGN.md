# Rixie Agent Architecture Redesign Proposal

---

## Executive Summary
The current `RixieAgent` is a monolithic, single-threaded function-calling loop with an in-memory history array. While simple for V1, it faces scaling bottlenecks as studio tools and long-term background workflows multiply.

This document proposes the **10-Year Redesign of Rixie Agent** into a **Multi-Agent Orchestrator with Dynamic Tool Routing, Session State Management, and Self-Correction**.

---

## 1. Single Agent vs. Multi-Agent (Orchestrator + Subagents)

### Proposal: YES — Transition to Orchestrator + Specialist Subagents

```
                          ┌────────────────────────────────┐
                          │    RIXIE ORCHESTRATOR AGENT    │
                          │   (Main Companion & Router)    │
                          └───────────────┬────────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            │                             │                             │
    ┌───────▼───────┐             ┌───────▼───────┐             ┌───────▼───────┐
    │   BP Studio   │             │  Art Studio   │             │ Music Studio  │
    │   Subagent    │             │   Subagent    │             │   Subagent    │
    └───────────────┘             └───────────────┘             └───────────────┘
```

- **Rixie Main Orchestrator**: Manages user dialogue, memory retrieval, high-level task planning, and user profile alignment.
- **Specialist Subagents**: When a task requires complex studio work (e.g. multi-scene video editing in BP Studio or audio scoring in Music Studio), Rixie spawns an isolated subagent with studio-specific tools and prompts.

---

## 2. Stateful vs. Stateless Execution (SessionStore)

### Proposal: Move from In-Memory `this.history` to SQLite `SessionStore`

```ts
export interface AgentSession {
  id: string;
  studio: string;
  model: string;
  provider: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionStore {
  createSession(studio?: string): Promise<AgentSession>;
  getHistory(sessionId: string, limit?: number): Promise<ProviderMessage[]>;
  appendMessage(sessionId: string, message: ProviderMessage): Promise<void>;
  summarizeOldMessages(sessionId: string): Promise<void>;
}
```

- **Benefit**: Zero data loss across server restarts, serverless Next.js route invocations, and multi-tab browser sessions.

---

## 3. Dynamic Tool Routing (Contextual Tool Filtering)

### Proposal: Filter Tools by Active Studio Context

- **Current Issue**: Passing all 50+ tool schemas in every turn confuses LLMs and wastes context window tokens.
- **Redesign**: Filter tools dynamically based on active studio and intent:

```ts
export class ToolRouter {
  getToolsForContext(studio: string, userMessage: string): ProviderTool[] {
    const generalTools = this.registry.getTools("general");
    const studioTools = this.registry.getTools(studio);
    return [...generalTools, ...studioTools];
  }
}
```

---

## 4. Self-Correction & Reflection Loop

### Proposal: Add Auto-Correction Guardrails

When a tool returns an error (e.g., invalid parameters or rendering failure):
1. **Tool Error Catch**: Intercept error output.
2. **Reflection Turn**: Feed error back to Rixie with diagnostic context (`"Tool 'render_video' failed due to missing aspect ratio. Please correct arguments and retry."`).
3. **Auto-Retry**: Rixie auto-corrects parameters and re-invokes tool transparently before returning to user.

---

## 5. Event-Driven Background Reactor

### Proposal: Event-Driven Background Task Runner

Allow Rixie to run long-running studio tasks (e.g. video rendering or AI audio generation) in the background without blocking the chat thread:

```ts
export interface BackgroundTask {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
}
```
When a background job finishes, Rixie sends a reactive notification to the user interface.
