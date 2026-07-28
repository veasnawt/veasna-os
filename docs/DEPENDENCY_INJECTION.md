# Rixie Dependency Injection (DI) & Inversion of Control Specification

---

## 💉 Dependency Injection Philosophy

To ensure 10-year maintainability, 100% unit-testability, and zero vendor lock-in, Rixie enforces **Constructor Dependency Injection (Constructor DI)** without heavy reflection containers or magic frameworks.

```
                         ┌────────────────────────────────┐
                         │      DEPENDENCY INJECTION      │
                         └───────────────┬────────────────┘
                                         │
       ┌──────────────────┬──────────────┴──────────────┬──────────────────┐
       ▼                  ▼                             ▼                  ▼
┌──────────────┐   ┌──────────────┐              ┌──────────────┐   ┌──────────────┐
│ LLM PROVIDER │   │ MEMORY STORE │              │ PERMISSION   │   │ PLUGIN       │
│ INJECTION    │   │ INJECTION    │              │ MANAGER INJ. │   │ REGISTRY INJ.│
│ (Mock/Real)  │   │ (Memory/Disk)│              │ (Strict/Test)│   │ (Studio/OS)  │
└──────────────┘   └──────────────┘              └──────────────┘   └──────────────┘
```

---

## 1. Why Explicit Constructor DI?

1. **Zero Framework Weight**: No heavy IoC libraries (Inversify, NestJS, Reflect-metadata). Clean, native TypeScript constructor injection.
2. **Instant Unit Testing**: Mock providers and in-memory SQLite stores can be injected in unit tests in milliseconds without network calls or file side effects.
3. **Explicit Contracts**: Dependencies are declared explicitly in class options interfaces (`RixieAgentOptions`, `ReasoningPipelineOptions`).

---

## 2. Constructor DI Code Pattern (`RixieAgent`)

```ts
export interface RixieAgentDependencies {
  provider?: LLMProvider;
  memoryStore?: MemoryStore;
  sessionStore?: SessionStore;
  permissionManager?: PermissionManager;
  pluginManager?: PluginManager;
}

export class RixieAgent {
  private provider: LLMProvider;
  private memoryStore: MemoryStore;
  private permissionManager: PermissionManager;
  private pluginManager: PluginManager;

  constructor(deps: RixieAgentDependencies = {}) {
    // Inject or fallback to default production instances
    this.provider = deps.provider ?? createProvider();
    this.memoryStore = deps.memoryStore ?? new MemoryStore();
    this.permissionManager = deps.permissionManager ?? new PermissionManager();
    this.pluginManager = deps.pluginManager ?? new PluginManager();
  }
}
```

---

## 3. Unit Testing with Mock Injections

```ts
// Example Unit Test: Testing Agent without API costs or filesystem mutations
describe("RixieAgent with Mock Dependencies", () => {
  it("executes tool correctly via injected mock provider", async () => {
    const mockProvider: LLMProvider = {
      name: "mock-anthropic",
      chat: async () => ({
        text: "I have calculated the palette.",
        toolCalls: [{ id: "call_1", name: "art_create_palette", input: { themeName: "Neon" } }],
      }),
    };

    const mockMemoryStore = new MemoryStore(":memory:"); // In-memory SQLite for tests

    const agent = new RixieAgent({
      provider: mockProvider,
      memoryStore: mockMemoryStore,
    });

    const result = await agent.chat("Create a palette");
    expect(result.reply).toBe("I have calculated the palette.");
    expect(result.toolCalls[0].name).toBe("art_create_palette");
  });
});
```

---

## 4. Fluent Builder Integration (`RixieBuilder`)

The `RixieBuilder` pattern acts as the dependency assembly factory:

```ts
const agent = Rixie.builder()
  .withProvider(customProvider)
  .withMemoryStore(customMemory)
  .withPermissionManager(strictPolicyManager)
  .build(); // Injects assembled dependencies into RixieAgent
```
