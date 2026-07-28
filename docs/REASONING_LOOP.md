# Rixie Reasoning Loop Architecture

---

## 🔄 The Master Reasoning Loop

The Rixie Reasoning Loop is a deterministic, event-driven cognitive pipeline that orchestrates the **5 Subsystems** (Memory Manager, Planner, Executor, Reflection, Summarizer) into a seamless execution turn.

```
                              [USER REQUEST]
                                    │
                                    ▼
                        ┌───────────────────────┐
                        │   MEMORY MANAGER      │
                        │ (Pre-Turn Retrieval)  │
                        └───────────┬───────────┘
                                    │ (Injected Context + User Profile)
                                    ▼
                        ┌───────────────────────┐
                        │       PLANNER         │
                        │ (Goal Decomposition)  │
                        └───────────┬───────────┘
                                    │ (Execution Plan DAG)
                                    ▼
                   ┌─────────────────────────────────┐
                   │        REASONING LOOP           │◄──────────────────┐
                   │           (EXECUTOR)            │                   │
                   └────────────────┬────────────────┘                   │
                                    │ (Tool Call Output)                 │
                                    ▼                                    │
                        ┌───────────────────────┐                        │
                        │      REFLECTION       │                        │
                        │ (Validation / Audit)  │                        │
                        └───────────┬───────────┘                        │
                                    │                                    │
                    ┌───────────────┴───────────────┐                    │
                    ▼                               ▼                    │
            [Validation PASSED]             [Validation FAILED]          │
                    │                               │                    │
                    ▼                               └────────────────────┘
        ┌───────────────────────┐                   (Auto-Corrected Retry)
        │      SUMMARIZER       │
        │ (Sliding Window &     │
        │ Auto Memory Extract)  │
        └───────────┬───────────┘
                    │
                    ▼
             [FINAL RESPONSE]
```

---

## 💻 Pipeline Code Structure (`core/agent/reasoningLoop.ts`)

```ts
export class RixieReasoningPipeline {
  constructor(
    private memoryManager: MemoryManager,
    private planner: TaskPlanner,
    private executor: TaskExecutor,
    private reflection: QualityReflection,
    private summarizer: SessionSummarizer
  ) {}

  async execute(sessionId: string, userMessage: string, studio = "global"): Promise<ChatResult> {
    // Step 1: Pre-turn Memory Retrieval
    const memoryContext = await this.memoryManager.retrieveContext(userMessage, studio);
    
    // Step 2: Goal Decomposition & Planning (for multi-step prompts)
    const plan = await this.planner.createPlan(userMessage, memoryContext);

    // Step 3: Reasoning & Tool Execution Loop
    let currentTurn = 0;
    const maxRetries = 3;
    const toolCallTraces: ToolCallTrace[] = [];
    let responseText = "";

    while (currentTurn < plan.maxIterations) {
      // Execute provider step
      const stepResult = await this.executor.step(sessionId, plan, memoryContext);

      if (stepResult.hasToolCalls) {
        // Step 4: Reflection & Self-Correction Audit
        const audit = await this.reflection.auditToolCalls(stepResult.toolCalls);

        if (!audit.valid) {
          // Auto-Corrected Retry Turn
          await this.executor.injectCorrectionTurn(sessionId, audit.feedback);
          currentTurn++;
          continue;
        }

        // Run Tool Dispatch
        const toolOutputs = await this.executor.runTools(stepResult.toolCalls);
        toolCallTraces.push(...toolOutputs.traces);
      } else {
        responseText = stepResult.text;
        break; // Plan completed
      }

      currentTurn++;
    }

    // Step 5: Post-turn Memory Extraction & Session Compression
    await this.summarizer.updateSlidingWindow(sessionId);
    await this.memoryManager.autoExtract(userMessage, responseText, studio);

    return {
      reply: responseText,
      toolCalls: toolCallTraces,
    };
  }
}
```

---

## ⚡ Benefits of This Pipeline Structure

1. **Modular Subsystem Separation**: Each cognitive module (`Planner`, `Executor`, `Reflection`, `Summarizer`, `MemoryManager`) has a single, isolated responsibility.
2. **Zero Fragility**: If Reflection catches a bad tool output or malformed JSON from a local model, it triggers a self-correction turn without crashing the application.
3. **Context Window Safety**: Summarizer keeps working memory within strict token limits automatically.
4. **Instant Extensibility**: New studios or tool modules plug into the `Executor` without touching the `ReasoningLoop` mechanics.
