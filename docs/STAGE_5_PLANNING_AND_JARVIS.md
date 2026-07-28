# Stage 5: Autonomous Planning & Jarvis OS Capabilities Specification

---

## 🏛️ Stage 5 Architecture Overview

Stage 5 represents the culmination of Rixie's evolution into an **Autonomous AI Operating System Companion**. It unifies **Autonomous DAG Planning**, **Jarvis System Control**, **Specialist Subagent Delegation**, and **Layer 2 Telemetry**:

```
                          ┌────────────────────────────────┐
                          │   STAGE 5 JARVIS OS ENGINE     │
                          └───────────────┬────────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            │                             │                             │
    ┌───────▼───────┐             ┌───────▼───────┐             ┌───────▼───────┐
    │  AUTONOMOUS   │             │   SUBAGENT    │             │   TELEMETRY   │
    │  DAG PLANNER  │             │  DELEGATION   │             │  INSPECTOR UI │
    │ (Goal Breakdown)            │ (Parallel Sub)│             │ (Tokens & Cost)
    └───────────────┘             └───────────────┘             └───────────────┘
```

---

## 1. Autonomous DAG Planning Engine

When a complex prompt arrives (*"Build a complete 30s promo for BP Studio with generated cover art and matching Lo-Fi score"*):

1. **Goal Decomposition**: The `TaskPlanner` generates a DAG (Directed Acyclic Graph) of sub-tasks:
   ```ts
   export interface ExecutionPlan {
     goal: string;
     steps: Array<{
       id: number;
       studio: "bp" | "art" | "music" | "gamedev" | "general";
       description: string;
       toolName: string;
       input: Record<string, unknown>;
       dependencies: number[];
     }>;
   }
   ```
2. **Step-by-Step Execution & Replanning**: The `Executor` steps through the plan. If a step fails, the `Planner` auto-adapts remaining steps dynamically.

---

## 2. Jarvis OS Control & Ambient Monitoring

- **System Diagnostics**: Monitors CPU, RAM, Disk space, and GPU usage (`get_system_health`).
- **Background Cron & Scheduler**: Schedules one-shot timers or recurring cron tasks (`schedule_timer`, `cron_job`) for video rendering or model training.
- **Reactive WebSocket Notifications**: When a background video render finishes, Rixie pushes a real-time notification badge to the UI console.

---

## 3. Subagent Delegation Architecture (IPC)

For heavy multi-studio tasks, Rixie spawns specialist subagents running in parallel:

```ts
export interface SubagentHandle {
  conversationId: string;
  role: string;
  studio: string;
  status: "idle" | "running" | "completed" | "failed";
}
```

- `spawn_subagent(role, prompt, studio)`: Spawns an isolated subagent with specialized tools and prompts.
- `send_message(recipientId, message)`: Inter-agent IPC message passing.
- `kill_subagent(conversationId)`: Safely terminates a background subagent.

---

## 4. Layer 2 Telemetry & Inspector Panel UI

Visualizes full system telemetry without cluttering the chat thread:
- **Thinking Tokens**: Collapsible reasoning accordion (`💭 Thinking (1.2s)...`).
- **Memory Retrieval**: Vector similarity scores and retrieved memory snippets.
- **Tool Latency**: Execution duration in milliseconds per tool call.
- **API Cost Calculator**: Real-time turn cost and cumulative session cost meter.
