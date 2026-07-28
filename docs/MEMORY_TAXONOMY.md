# Rixie Cognitive Memory Engine Taxonomy

---

## 🏛️ Memory Architecture Overview

To evolve into a true OS companion and creative partner, Rixie structures memory into distinct cognitive tiers inspired by human neuroscience:

```
                               ┌────────────────────────────────┐
                               │       RIXIE MEMORY ENGINE      │
                               └───────────────┬────────────────┘
                                               │
            ┌──────────────────────────────────┴──────────────────────────────────┐
            │                                                                     │
 ┌──────────▼──────────┐                                               ┌──────────▼──────────┐
 │ SHORT-TERM MEMORY   │                                               │  LONG-TERM MEMORY   │
 │ (Working Memory /   │                                               │ (SQLite Persistent) │
 │ Sliding Window)     │                                               └──────────┬──────────┘
 └─────────────────────┘                                                          │
                                         ┌────────────────────────────────────────┼────────────────────────────────────────┐
                                         │                                        │                                        │
                              ┌──────────▼──────────┐                  ┌──────────▼──────────┐                  ┌──────────▼──────────┐
                              │  EPISODIC MEMORY    │                  │   SEMANTIC MEMORY   │                  │ USER PROFILE MEMORY │
                              │ (Session Timeline,  │                  │ (Facts, Rules,      │                  │ (Core Preferences,  │
                              │ Project Milestones) │                  │ Knowledge Graph)    │                  │ Personality Traits) │
                              └─────────────────────┘                  └─────────────────────┘                  └─────────────────────┘
```

---

## 1. Short-Term Memory (Working Memory)

- **Definition**: The active, immediate dialogue history within the current chat session.
- **Current Limitation**: Unbounded array in memory (`this.history`) causes context window overflow over long sessions.
- **10-Year Target Implementation**:
  - **Sliding Window**: Retain the last $N$ turns (e.g., last 10 messages) in raw uncompressed format for maximum precision.
  - **Summary Buffer**: When turn count exceeds $N$, run a background summarization turn to compress preceding messages into a `[Session Summary]` block injected at the top of working memory.

---

## 2. Long-Term Memory Tiers

### Tier A: Episodic Memory (Events & Timeline)
- **Definition**: Time-stamped narrative events recording what happened during past creative sessions.
- **Examples**:
  - *"Created 3 short video script drafts for Khmer Cooking on 2026-07-28."*
  - *"Rendered background score for BP Studio Project #4."*
- **Storage**: `kind: "episodic"`, `session_id`, `created_at`.
- **Decay Factor**: Standard exponential time decay ($e^{-\lambda \cdot \Delta t}$).
- **Purpose**: Enables Rixie to answer questions like *"What did we work on yesterday?"* or *"Show project timeline"*.

---

### Tier B: Semantic Memory (Domain Facts & Studio Knowledge)
- **Definition**: Concept-based facts, studio rules, constraints, and creative knowledge detached from specific events.
- **Examples**:
  - *"BP Studio short videos perform best under 30 seconds in 9:16 vertical aspect ratio."*
  - *"Game jump mechanic requires 250ms buffer time."*
- **Storage**: `kind: "semantic_fact"`, indexed via SQLite FTS5 + Vector Embeddings.
- **Decay Factor**: Low time decay, boosted by similarity score and usage frequency.
- **Purpose**: Enables Rixie to apply creative rules and domain knowledge across all studios automatically.

---

### Tier C: User Profile Memory (Core Identity & Pinned Preferences)
- **Definition**: Permanent user traits, workflow habits, and identity preferences.
- **Examples**:
  - *Name: Veasna*
  - *Primary Language: Khmer / English*
  - *Design Aesthetic: Dark Mode, Warm Gold Accents, Minimalist*
- **Storage**: `kind: "user_profile"`, `importance = 1.0`.
- **Decay Factor**: **Zero Time Decay ($\lambda = 0$)** — never expires or decays.
- **Purpose**: Always injected into Rixie's system prompt context so she acts like your personalized companion.

---

## 📊 Summary of Memory Tier Characteristics

| Memory Tier | Lifespan | Storage Medium | Retrieval Mechanism | Time Decay |
| :--- | :--- | :--- | :--- | :--- |
| **Short-Term (Working)** | Current session | RAM / Sliding Window | Exact Message Array | Exists only during session |
| **Episodic** | Months to Years | SQLite `memories` | Time-series & FTS5 | Standard ($e^{-\lambda t}$) |
| **Semantic** | Permanent | SQLite + Vector | Hybrid Vector + FTS5 | Low decay |
| **User Profile** | Permanent | SQLite Pinned | Always-Injected System Context | **Zero Decay ($\lambda = 0$)** |
