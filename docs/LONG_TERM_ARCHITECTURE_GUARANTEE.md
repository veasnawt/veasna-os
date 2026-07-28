# Rixie 10-Year Long-Term Architecture Charter

---

## 🏛️ The Long-Term Architecture Charter

By prioritizing **Long-Term Architecture over Short-Term Convenience**, Rixie and Veasna OS reject temporary hacks, monolithic debt, and in-RAM compromises.

The following **5 Immutable System Guarantees** govern all code written for Rixie:

```
┌─────────────────────────────────────────────────────────────────────────┐
│               THE 5 IMMUTABLE ARCHITECTURAL GUARANTEES                  │
└─────────────────────────────────────────────────────────────────────────┘
  1. ZERO MONOLITHIC DEBT        ──► Decoupled plugins over core bloat
  2. ZERO IN-RAM SESSION STATE   ──► SQLite owns 100% of state truth
  3. ZERO SWALLOWED ERRORS       ──► Typed errors & self-correcting turns
  4. ZERO VENDOR LOCK-IN         ──► Swappable LLM compute drivers
  5. ZERO UNGUARDED ACTIONS      ──► Enforced 3-Tier Security Manager
```

---

## 1. 🧩 Guarantee 1: Zero Monolithic Debt
- Short-term convenience says: *"Import studio tools directly into rixie-core so it runs today."*
- Long-term architecture mandates: Core engine knows NOTHING about specific studio applications. Every capability is an isolated, dynamic `RixiePlugin`.

---

## 2. 🗄️ Guarantee 2: Zero In-RAM Session State
- Short-term convenience says: *"Store chat history in `this.history = []` array in RAM."*
- Long-term architecture mandates: All session state, thread history, memories, and preferences live in SQLite. Any server process or lambda can crash mid-turn without losing state truth.

---

## 3. 🛡️ Guarantee 3: Zero Swallowed Errors
- Short-term convenience says: *"Wrap broken tools in `try {} catch {}` and return dummy fallbacks."*
- Long-term architecture mandates: Every failure produces a typed `RixieError` and triggers a Reflection diagnostic turn for auto-corrected recovery or explicit user feedback.

---

## 4. 🔌 Guarantee 4: Zero Vendor Lock-In
- Short-term convenience says: *"Use vendor-specific SDKs and custom prompt hacks."*
- Long-term architecture mandates: LLMs are swappable compute drivers conforming to a minimal `LLMProvider` contract.

---

## 5. 🔒 Guarantee 5: Zero Unguarded System Actions
- Short-term convenience says: *"Execute shell commands immediately without asking."*
- Long-term architecture mandates: All system, shell, and communication actions are governed by a 3-Tier `PermissionManager` requiring explicit policy validation or interactive user prompts.
