# Rixie Engineering & Coding Standards

---

## 📜 Core Philosophy

Rixie is built to be maintained for the next **10 years**. Code must be clean, readable, type-safe, resilient, and minimal in dependencies.

---

## 1. TypeScript & Type Safety Rules

- **Strict Mode Mandatory**: `"strict": true` and `"noImplicitAny": true` in all `tsconfig.json` files.
- **Zero `any` Policy**: Never use `any`. Use `unknown` for dynamic JSON inputs and cast with explicit runtime type guards.
- **Explicit Return Types**: All exported functions, class methods, and API routes must explicitly declare return types:
  ```ts
  // CORRECT:
  export async function searchMemory(query: string): Promise<MemoryItem[]> { ... }

  // INCORRECT:
  export async function searchMemory(query: string) { ... }
  ```
- **Readonly Interfaces**: Use `readonly` arrays and properties where state should not be mutated:
  ```ts
  export interface ProviderRequestOptions {
    readonly messages: readonly ProviderMessage[];
    readonly tools?: readonly ProviderTool[];
  }
  ```

---

## 2. Error Handling & Resiliency Rules

- **No Silent Exception Swallowing**: Never wrap code in empty `try { ... } catch {}` blocks or return silent dummy fallbacks.
- **Typed Error Hierarchy**: Define explicit domain error classes extending `RixieError`:
  ```ts
  export class RixieError extends Error {
    constructor(message: string, public code: string) {
      super(message);
      this.name = "RixieError";
    }
  }

  export class ProviderError extends RixieError { ... }
  export class ToolExecutionError extends RixieError { ... }
  export class PermissionDeniedError extends RixieError { ... }
  ```
- **Tool Reflection & Recovery**: Tools should return structured error objects `{ status: "error", message: string }` so the Reflection subsystem can attempt an auto-corrected retry instead of crashing the process.

---

## 3. Naming & Formatting Conventions

| Element | Convention | Example |
| :--- | :--- | :--- |
| **Classes & Interfaces** | PascalCase | `RixieAgent`, `LLMProvider`, `MemoryStore` |
| **Functions & Variables** | camelCase | `createProvider`, `searchMemory`, `userMessage` |
| **Global Constants** | UPPER_CASE | `DEFAULT_MODEL`, `MAX_TOKENS`, `MEMORY_DB_PATH` |
| **File Names** | camelCase / kebab-case | `memoryStore.ts`, `toolsRegistry.ts`, `agent.ts` |
| **Database Tables & Columns** | snake_case | `memories`, `session_id`, `created_at` |

---

## 4. Minimal Dependency Discipline

- **Prefer Native Standards**: Use native Web APIs (`fetch`, `ReadableStream`, `URL`, `Buffer`, `crypto`) over heavy npm packages.
- **Zero Framework Bloat**: No LangChain, LlamaIndex, AutoGen, or heavy agent abstractions.
- **Pure Database Core**: SQLite via `better-sqlite3` for local persistence.

---

## 5. Architectural Scoping & Open/Closed Principle

- **Plugins Over Monoliths**: Never add studio-specific tools directly into `rixie-core`. Wrap studio capabilities in independent `RixiePlugin` modules.
- **Pure Function Decoupling**: Keep business logic pure and decoupled from React components or Next.js route handlers.
