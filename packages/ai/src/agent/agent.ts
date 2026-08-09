/**
 * Core orchestrator: a provider-agnostic function-calling loop with automatic memory extraction,
 * contextual retrieval, and persistent SQLite session history.
 *
 * Supports Anthropic, OpenAI, Google Gemini, Ollama, OpenRouter, Groq, DeepSeek, etc.
 */
import * as config from "./config";
import { buildToolset } from "./toolsRegistry";
import { MemoryItem, MemoryStore } from "../memory/memoryStore";
import { SessionStore, UiChatMessage, generateTopicTitle } from "../memory/sessionStore";
import { extractMemories } from "../memory/extractor";
import { ToolFn, ToolSchema, ToolModule } from "../tools/types";
import { LocalResolver } from "./localResolver";
import {
  createProvider,
  LLMProvider,
  ProviderMessage,
  ProviderTool,
} from "../providers";

export interface ToolCallTrace {
  name: string;
  input: unknown;
  output: unknown;
}

export interface ChatResult {
  reply: string;
  toolCalls: ToolCallTrace[];
  sessionId: string;
  resolvedLocally?: boolean;
  source?: "local_memory" | "local_tool" | "local_system" | "external_llm";
  confidence?: number;
}

// Module-level, not per-instance: a host typically constructs a fresh RixieAgent on every request
// (studios/universe's /api/agent route does exactly this), so anything incognito needs to survive
// across those short-lived instances the same way a real session survives via the SQLite file on
// disk — just kept in process memory instead, for the life of the server process, and never
// written anywhere. Restarting the server (or the process simply exiting) forgets it completely.
const incognitoHistories = new Map<string, ProviderMessage[]>();

export interface RixieAgentOptions {
  provider?: LLMProvider;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
  memoryDbPath?: string;
  autoExtractMemory?: boolean;
  autoRetrieveMemory?: boolean;
  /** Tool names (from any registered module's schemas) to exclude entirely — the tool never
   *  appears in what's offered to the provider, and can't be invoked even if the model asks for
   *  it by name. Mainly for hosts embedding RixieAgent somewhere `osSystemTools`' real
   *  filesystem/shell/git access is out of scope (e.g. an in-app assistant that should only know
   *  about its own sandboxed data, not the host machine it happens to be running on). */
  disabledTools?: string[];
  /** Additional tool modules merged in alongside the built-in registry — lets a host application
   *  expose its own app-specific tools (e.g. operations scoped to that host's own sandbox) without
   *  needing them baked into this package, which has no idea what any particular host even is.
   *  Applied after disabledTools, so an extra tool's name is never accidentally filtered by it. */
  extraTools?: ToolModule[];
}

export class RixieAgent {
  private provider: LLMProvider;
  private memory: MemoryStore;
  private sessionStore: SessionStore;
  private tools: ProviderTool[];
  private dispatch: Record<string, ToolFn>;
  private schemas: ToolSchema[];
  private localResolver: LocalResolver;
  private model: string;
  private maxTokens: number;
  private systemPrompt: string;
  private autoExtractMemory: boolean;
  private autoRetrieveMemory: boolean;

  constructor(options: RixieAgentOptions = {}) {
    this.provider = options.provider || createProvider();
    const dbPath = options.memoryDbPath || config.MEMORY_DB_PATH;
    this.memory = new MemoryStore(dbPath);
    this.sessionStore = new SessionStore(dbPath);

    this.model = options.model || config.MODEL;
    this.maxTokens = options.maxTokens || config.MAX_TOKENS;
    this.systemPrompt = options.systemPrompt || config.SYSTEM_PROMPT;
    this.autoExtractMemory = options.autoExtractMemory ?? true;
    this.autoRetrieveMemory = options.autoRetrieveMemory ?? true;

    const { schemas: allSchemas, dispatch: allDispatch } = buildToolset(this.memory);
    const disabled = new Set(options.disabledTools ?? []);
    let schemas = disabled.size === 0 ? allSchemas : allSchemas.filter((s) => !disabled.has(s.name));
    let dispatch =
      disabled.size === 0
        ? allDispatch
        : Object.fromEntries(Object.entries(allDispatch).filter(([name]) => !disabled.has(name)));
    for (const extra of options.extraTools ?? []) {
      schemas = [...schemas, ...extra.schemas];
      dispatch = { ...dispatch, ...extra.dispatch };
    }
    this.schemas = schemas;
    this.tools = this.schemas.map((s) => ({
      name: s.name,
      description: s.description,
      parameters: s.input_schema as Record<string, unknown>,
    }));
    this.dispatch = dispatch;
    this.localResolver = new LocalResolver(this.memory, this.dispatch, this.schemas);
  }

  async chat(
    userMessage: string,
    maxToolIterations = 8,
    studio = "global",
    sessionId = "default_session",
    incognito = false
  ): Promise<ChatResult> {
    // Deliberately a fully separate method rather than `if (incognito)` branches sprinkled through
    // the method below — a real privacy guarantee is easier to trust (and to verify by inspection)
    // when the incognito path literally cannot reach `this.sessionStore` or `extractMemories` at
    // all, rather than relying on every future edit to this method remembering to check a flag.
    if (incognito) return this.chatIncognito(userMessage, maxToolIterations, studio, sessionId);

    // 1. Initialize or load persistent session
    const session = this.sessionStore.getOrCreateSession(sessionId, studio, this.provider.name, this.model);

    // Auto-update session topic title if unassigned or default
    if (!session.title || session.title.startsWith("New Chat") || session.title.startsWith("session_") || session.title === "default_session") {
      const topicTitle = generateTopicTitle(userMessage);
      this.sessionStore.updateSessionTitle(sessionId, topicTitle);
    }

    // 2. LOCAL-FIRST INTELLIGENCE EVALUATION: Try resolving locally first (0 external API calls)
    const localRes = await this.localResolver.resolve(userMessage, studio);
    if (localRes.resolvedLocally) {
      const userMsgObj: ProviderMessage = { role: "user", content: userMessage };
      const assistantMsgObj: ProviderMessage = { role: "assistant", content: localRes.reply };

      this.sessionStore.addMessage(sessionId, userMsgObj);
      this.sessionStore.addMessage(sessionId, assistantMsgObj);

      return {
        reply: localRes.reply,
        toolCalls: localRes.toolCalls,
        sessionId,
        resolvedLocally: true,
        source: localRes.source,
        confidence: localRes.confidence,
      };
    }

    // 3. Automatic Pre-turn Memory Retrieval for LLM fallback
    let augmentedPrompt = this.systemPrompt;
    if (this.autoRetrieveMemory) {
      const retrieved = this.memory.search(userMessage, studio, 3);
      if (retrieved.length > 0) {
        const memoryContext = retrieved
          .map((m) => `- [Memory (${m.studio}/${m.kind})]: ${m.content}`)
          .join("\n");
        augmentedPrompt += `\n\nContext Retrieved From Rixie Memory Engine:\n${memoryContext}`;
      }
    }

    // 4. Load persistent message history from SQLite SessionStore
    const userMsgObj: ProviderMessage = { role: "user", content: userMessage };
    this.sessionStore.addMessage(sessionId, userMsgObj);

    const history = this.sessionStore.getHistory(sessionId);
    const toolCallTraces: ToolCallTrace[] = [];
    let finalReply = "";

    for (let i = 0; i < maxToolIterations; i++) {
      const response = await this.provider.chat({
        model: this.model,
        maxTokens: this.maxTokens,
        systemPrompt: augmentedPrompt,
        tools: this.tools,
        messages: history,
      });

      if (response.toolCalls.length === 0) {
        finalReply = response.text;
        const assistantMsg: ProviderMessage = { role: "assistant", content: finalReply };
        this.sessionStore.addMessage(sessionId, assistantMsg);
        history.push(assistantMsg);
        break;
      }

      const assistantToolMsg: ProviderMessage = {
        role: "assistant",
        content: response.text,
        toolCalls: response.toolCalls,
      };
      const messagesToSave = [assistantToolMsg];

      for (const call of response.toolCalls) {
        const result = await this.runTool(call.name, call.input);

        toolCallTraces.push({
          name: call.name,
          input: call.input,
          output: result,
        });

        messagesToSave.push({
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
          content:
            typeof result === "string"
              ? result
              : JSON.stringify(result),
        });
      }

      this.sessionStore.saveMessages(sessionId, messagesToSave);

      history.push(...messagesToSave);
    }

    if (!finalReply) {
      finalReply = "[Stopped after max tool iterations — the request may be too complex for one turn.]";
    }

    // 4. Automatic Post-turn Memory Extraction
    if (this.autoExtractMemory && userMessage) {
      extractMemories(userMessage, finalReply, studio, this.memory).catch(() => { });
    }

    return {
      reply: finalReply,
      toolCalls: toolCallTraces,
      sessionId,
      resolvedLocally: false,
      source: "external_llm",
      confidence: toolCallTraces.length > 0 ? 1.0 : 0.7,
    };
  }

  /** The incognito counterpart to chat() above — same function-calling loop, but history lives
   *  only in the module-level incognitoHistories map (never this.sessionStore/SQLite), there's no
   *  session title to generate, and — the actual point of "incognito" — no autoExtractMemory call
   *  at the end, so nothing about this conversation shapes what Rixie remembers about the user
   *  afterward. Memory RETRIEVAL (autoRetrieveMemory, reading existing memories for context) still
   *  runs; incognito means "don't learn anything new from this," not "forget who I already am." */
  private async chatIncognito(
    userMessage: string,
    maxToolIterations: number,
    studio: string,
    sessionId: string
  ): Promise<ChatResult> {
    const history = incognitoHistories.get(sessionId) ?? [];
    incognitoHistories.set(sessionId, history);

    const localRes = await this.localResolver.resolve(userMessage, studio);
    if (localRes.resolvedLocally) {
      history.push({ role: "user", content: userMessage });
      history.push({ role: "assistant", content: localRes.reply });
      return {
        reply: localRes.reply,
        toolCalls: localRes.toolCalls,
        sessionId,
        resolvedLocally: true,
        source: localRes.source,
        confidence: localRes.confidence,
      };
    }

    let augmentedPrompt = this.systemPrompt;
    if (this.autoRetrieveMemory) {
      const retrieved = this.memory.search(userMessage, studio, 3);
      if (retrieved.length > 0) {
        const memoryContext = retrieved
          .map((m) => `- [Memory (${m.studio}/${m.kind})]: ${m.content}`)
          .join("\n");
        augmentedPrompt += `\n\nContext Retrieved From Rixie Memory Engine:\n${memoryContext}`;
      }
    }

    history.push({ role: "user", content: userMessage });

    const toolCallTraces: ToolCallTrace[] = [];
    let finalReply = "";

    for (let i = 0; i < maxToolIterations; i++) {
      const response = await this.provider.chat({
        model: this.model,
        maxTokens: this.maxTokens,
        systemPrompt: augmentedPrompt,
        tools: this.tools,
        messages: history,
      });

      if (response.toolCalls.length === 0) {
        finalReply = response.text;
        history.push({ role: "assistant", content: finalReply });
        break;
      }

      const assistantToolMsg: ProviderMessage = {
        role: "assistant",
        content: response.text,
        toolCalls: response.toolCalls,
      };
      history.push(assistantToolMsg);

      for (const call of response.toolCalls) {
        const result = await this.runTool(call.name, call.input);
        toolCallTraces.push({ name: call.name, input: call.input, output: result });
        history.push({
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      }
    }

    if (!finalReply) {
      finalReply = "[Stopped after max tool iterations — the request may be too complex for one turn.]";
    }

    return {
      reply: finalReply,
      toolCalls: toolCallTraces,
      sessionId,
      resolvedLocally: false,
      source: "external_llm",
      confidence: toolCallTraces.length > 0 ? 1.0 : 0.7,
    };
  }

  /** Drops an incognito conversation's in-memory history outright — called when the client leaves
   *  incognito mode (toggling off, or closing the window) so it doesn't just sit unused in process
   *  memory until the server itself restarts. Never touches SQLite, since incognito sessions never
   *  reach it in the first place. */
  clearIncognitoSession(sessionId: string): void {
    incognitoHistories.delete(sessionId);
  }

  private async runTool(name: string, input: unknown): Promise<unknown> {
    const fn = this.dispatch[name];
    if (!fn) {
      return { error: `Unknown tool: ${name}` };
    }
    try {
      return await fn(input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  // Session History Retrieval
  getSessionHistory(sessionId = "default_session"): UiChatMessage[] {
    return this.sessionStore.getUiMessages(sessionId);
  }

  clearSessionHistory(sessionId = "default_session"): void {
    this.sessionStore.clearSession(sessionId);
  }

  reset(sessionId = "default_session"): void {
    this.clearSessionHistory(sessionId);
  }

  // Programmatic memory store helpers
  remember(
    content: string,
    studio = "global",
    kind = "user_preference",
    metadata: Record<string, unknown> = {}
  ): number {
    return this.memory.add(studio, kind, content, metadata);
  }

  searchMemory(query: string, studio?: string, limit = 10): MemoryItem[] {
    return this.memory.search(query, studio, limit);
  }

  getMemoryStore(): MemoryStore {
    return this.memory;
  }

  // Programmatic configuration setters
  setProvider(provider: LLMProvider): this {
    this.provider = provider;
    return this;
  }

  setModel(model: string): this {
    this.model = model;
    return this;
  }

  setSystemPrompt(prompt: string): this {
    this.systemPrompt = prompt;
    return this;
  }
}
