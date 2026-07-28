# Rixie Principal Engineer Architectural Blueprint

---

## 🏛️ The Principal Engineer's Manifesto

Designing an AI Operating System intended to scale for the next 10+ years requires adhering to **4 Invariant System Pillars**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│              THE 4 PRINCIPAL ARCHITECTURAL INVARIANTS                   │
└─────────────────────────────────────────────────────────────────────────┘
  1. STATE IS EXTERNALIZED        ──► Engine is stateless; SQLite owns truth
  2. PROVIDERS ARE COMMODITIES    ──► LLMs are swappable compute drivers
  3. EXTENSIONS ARE ISOLATED      ──► Studio tools are zero-trust plugins
  4. OBSERVABILITY IS A CONTRACT   ──► Every turn emits structured telemetry
```

---

## 1. Pillar 1: State Is Externalized (Stateless Engine, Disk Truth)

- **Principle**: The execution engine (`packages/rixie-core`) must hold **zero in-memory session state**.
- **Implementation**: All session states, conversation histories, episodic memories, and user profile traits live exclusively in SQLite (`sessions`, `messages`, `memories`).
- **Resiliency Impact**: If the Node.js server process crashes mid-turn, serverless lambdas recycle, or the user switches browser tabs, the agent rehydrates from disk in 1ms with 0 state corruption.

---

## 2. Pillar 2: Providers Are Commodities (Zero Vendor Lock-In)

- **Principle**: AI models evolve at breakneck speed. Rixie must treat LLMs as swappable compute drivers.
- **Implementation**: The engine communicates exclusively through a minimal, immutable `LLMProvider` contract. Rixie never hardcodes vendor SDKs or vendor-specific prompt hacks.
- **Flexibility Impact**: Swapping from Anthropic (`claude-sonnet-5`) to OpenAI (`gpt-4o`), Google Gemini (`gemini-2.0-flash`), or local Ollama (`llama3.1`) requires zero code changes outside of 1 line of configuration.

---

## 3. Pillar 3: Extensions Are Isolated Plugins (Zero-Trust Open/Closed)

- **Principle**: The core engine must be closed for modification, open for extension.
- **Implementation**: `rixie-core` contains zero studio-specific code. Every capability (BP Video Studio, Art Studio, Music Studio, Game Dev Studio, Code Editing, Voice, Calendar, Email) is registered dynamically as a `RixiePlugin` with an enforced 3-Tier Security Permission policy.
- **Scalability Impact**: Adding 10 new studios or 100 new tools over the next decade will never bloat or break core engine stability.

---

## 4. Pillar 4: Observability Is a First-Class System Contract

- **Principle**: You cannot manage or trust what you cannot measure.
- **Implementation**: Every cognitive turn produces a deterministic `TurnTelemetry` contract containing trace spans, memory retrieval scores, tool execution latencies, and token/API cost calculations.
- **User Experience Impact**: Layer 1 provides a clean, quiet surface for creative co-creation, while Layer 2 exposes full deep telemetry inspection for developers and power users.
