# Rixie Multi-Agent Collaboration Architecture Specification

---

## 👥 Multi-Agent Collaboration Overview

To tackle complex creative projects spanning multiple studios simultaneously, Rixie operates as a **Multi-Agent Orchestrator**, spawning and coordinating specialist subagents in parallel with inter-agent message passing (IPC) and shared SQLite memory access:

```
                          ┌────────────────────────────────┐
                          │    RIXIE MASTER ORCHESTRATOR   │
                          │        (Team Leader)           │
                          └───────────────┬────────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            │                             │                             │
    ┌───────▼───────┐             ┌───────▼───────┐             ┌───────▼───────┐
    │ VIDEO AGENT   │             │   ART AGENT   │             │  MUSIC AGENT  │
    │ (BP Studio)   │             │  (Visuals)    │             │  (Scoring)    │
    └───────┬───────┘             └───────┬───────┘             └───────┬───────┘
            │                             │                             │
            └─────────────────────────────┼─────────────────────────────┘
                                          │
                          ┌───────────────▼────────────────┐
                          │    SHARED MEMORY & BUS IPC     │
                          │   (memory.db & Event Bus)      │
                          └────────────────────────────────┘
```

---

## 1. Specialist Subagent Roles

1. **Video Production Agent (`video-agent`)**: BP Studio specialist for video scriptwriting, scene breakdowns, shot planning, and FFmpeg rendering.
2. **Visual Art Agent (`art-agent`)**: Digital Art specialist for prompt engineering, palette creation, and thumbnail rendering.
3. **Music & Audio Agent (`music-agent`)**: Music Studio specialist for track arrangement, BPM key planning, lyric composition, and stem mixing.
4. **Game Dev Agent (`gamedev-agent`)**: Game Dev specialist for mechanics rules, level layout JSON, and sprite sheet specs.
5. **Code & System Agent (`code-agent`)**: Workspace specialist for file editing, refactoring, git commits, and shell compilation.

---

## 2. Inter-Agent Communication Protocol (IPC)

Subagents communicate via a lightweight, event-driven Message Bus:

```ts
export interface AgentMessage {
  id: string;
  senderId: string;
  recipientId: string;
  topic: string;
  content: unknown;
  timestamp: number;
}

export interface SubagentManager {
  spawnSubagent(role: string, prompt: string, studio: string): Promise<string>;
  sendMessage(recipientId: string, message: AgentMessage): Promise<void>;
  killSubagent(conversationId: string): Promise<void>;
  listActiveSubagents(): Promise<SubagentHandle[]>;
}
```

---

## 3. Parallel Execution & Cross-Studio Workflow

### Example: "Build a 30s Promo Video with Original Score and Cover Art"

```
[USER REQUEST] ──► Rixie Orchestrator
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
[video-agent]      [art-agent]      [music-agent]
(Drafts Script)    (Renders Cover)  (Composes Score)
        │                │                │
        └────────────────┼────────────────┘
                         ▼
        Rixie Orchestrator Synthesizes Assets
                         │
                         ▼
            [FINAL RENDER & PREVIEW]
```

1. **Parallel Spawning**: Rixie Orchestrator spawns `video-agent`, `art-agent`, and `music-agent` simultaneously.
2. **Concurrent Execution**: Each subagent works independently inside its studio domain using specialist tools.
3. **Shared Memory Synthesis**: Subagents publish completed asset metadata to `memory.db`.
4. **Final Assembly**: Rixie Orchestrator synthesizes output into a unified final presentation for the user.
