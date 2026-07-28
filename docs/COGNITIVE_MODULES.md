# Rixie Cognitive Subsystem Architecture

---

## Architecture Overview

To scale Rixie into an autonomous AI operating system companion, Rixie's single execution loop is refactored into **5 specialized, decoupled cognitive subsystems**:

```
                                  ┌───────────────────────────────┐
                                  │      RIXIE COGNITIVE LOOP     │
                                  └───────────────┬───────────────┘
                                                  │
       ┌──────────────────┬───────────────────────┼───────────────────────┬──────────────────┐
       ▼                  ▼                       ▼                       ▼                  ▼
┌──────────────┐   ┌──────────────┐        ┌──────────────┐        ┌──────────────┐   ┌──────────────┐
│   PLANNER    │   │   EXECUTOR   │        │  REFLECTION  │        │  SUMMARIZER  │   │   MEMORY     │
│ Task & Goal  │   │ Tool & Code  │        │ Self-Correct │        │ Sliding      │   │   MANAGER    │
│ Decomposition│   │ Execution    │        │ & Auditing   │        │ Window &     │   │ FTS5, Vector │
│              │   │              │        │              │        │ Compression  │   │ & Profile    │
└──────────────┘   └──────────────┘        └──────────────┘        └──────────────┘   └──────────────┘
```

---

## 1. Planner (Task & Goal Decomposition)

- **Role**: Takes high-level creative prompts (e.g. *"Create a 30s video promo for BP Studio with matching soundtrack"*) and breaks them down into an ordered execution DAG (Directed Acyclic Graph) of sub-tasks.
- **Output**:
  ```ts
  export interface ExecutionPlan {
    goal: string;
    steps: Array<{
      id: number;
      studio: "bp" | "music" | "art" | "gamedev" | "general";
      action: string;
      dependencies: number[];
    }>;
  }
  ```

---

## 2. Executor (Tool & Code Runner)

- **Role**: Executes plan steps sequentially or in parallel by calling studio tools, invoking providers, or dispatching background tasks.
- **Responsibilities**:
  - Provider communication via standard `LLMProvider` (`chat`, `streamChat`).
  - Studio tool invocation and error capturing.
  - Subagent task delegation.

---

## 3. Reflection (Self-Correction & Quality Audit)

- **Role**: Audits tool outputs and generated responses before returning them to the user or proceeding to the next plan step.
- **Capabilities**:
  - **Schema Validation**: Ensures tool arguments conform to JSON schemas.
  - **Error Interception**: If a tool fails, generates a reflection turn with targeted error diagnostics and triggers an auto-corrected retry.
  - **Quality Evaluation**: Verifies that generated scripts/prompts meet project preferences stored in memory.

---

## 4. Summarizer (Working Memory Compressor)

- **Role**: Prevents context window overflow in long multi-turn sessions.
- **Capabilities**:
  - **Sliding Window Maintenance**: Retains raw messages for the last $N$ turns.
  - **Context Compression**: When turns exceed threshold, compresses preceding dialogue into a concise `[Session Summary]` block injected into working memory.
  - **Milestone Extraction**: Converts major milestones into episodic memory entries.

---

## 5. Memory Manager (Storage, Retrieval & Profile Engine)

- **Role**: Manages all long-term memory operations across Episodic, Semantic, and User Profile tiers.
- **Capabilities**:
  - **Auto-Extraction**: Extracts facts and preferences post-turn.
  - **Pre-Turn Retrieval**: Queries FTS5 + Vector Embeddings for relevant memories prior to LLM inference.
  - **User Profile Pinning**: Maintains permanent user identity and design preferences ($\lambda = 0$ decay).
  - **Time Decay & Ranking**: Applies decay weighting to older episodic memories.
