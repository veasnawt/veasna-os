/**
 * Core orchestrator: a provider-agnostic function-calling loop with automatic memory extraction,
 * contextual retrieval, and persistent SQLite session history.
 *
 * Supports Anthropic, OpenAI, Google Gemini, Ollama, OpenRouter, Groq, DeepSeek, etc.
 */
import * as config from "./config";
import { buildToolset } from "./toolsRegistry";
import { MemoryItem, MemoryStore } from "../memory/memoryStore";
import { SessionStore, UiChatMessage } from "../memory/sessionStore";
import { extractMemories } from "../memory/extractor";
import { ToolFn } from "../tools/types";
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
}

export interface RixieAgentOptions {
  provider?: LLMProvider;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
  memoryDbPath?: string;
  autoExtractMemory?: boolean;
  autoRetrieveMemory?: boolean;
}

export class RixieAgent {
  private provider: LLMProvider;
  private memory: MemoryStore;
  private sessionStore: SessionStore;
  private tools: ProviderTool[];
  private dispatch: Record<string, ToolFn>;
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

    const { schemas, dispatch } = buildToolset(this.memory);
    this.tools = schemas.map((s) => ({
      name: s.name,
      description: s.description,
      parameters: s.input_schema as Record<string, unknown>,
    }));
    this.dispatch = dispatch;
  }

  async chat(
    userMessage: string,
    maxToolIterations = 8,
    studio = "global",
    sessionId = "default_session"
  ): Promise<ChatResult> {
    // 1. Initialize or load persistent session
    this.sessionStore.getOrCreateSession(sessionId, studio, this.provider.name, this.model);

    // 2. Automatic Pre-turn Memory Retrieval
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

    // 3. Load persistent message history from SQLite SessionStore
    const userMsgObj: ProviderMessage = { role: "user", content: userMessage };
    this.sessionStore.addMessage(sessionId, userMsgObj);

    const history = this.sessionStore.getHistory(sessionId, 50);
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
      this.sessionStore.addMessage(sessionId, assistantToolMsg);
      history.push(assistantToolMsg);

      for (const call of response.toolCalls) {
        const result = await this.runTool(call.name, call.input);
        toolCallTraces.push({ name: call.name, input: call.input, output: result });

        const toolMsg: ProviderMessage = {
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
          content: typeof result === "string" ? result : JSON.stringify(result),
        };
        this.sessionStore.addMessage(sessionId, toolMsg);
        history.push(toolMsg);
      }
    }

    if (!finalReply) {
      finalReply = "[Stopped after max tool iterations — the request may be too complex for one turn.]";
    }

    // 4. Automatic Post-turn Memory Extraction
    if (this.autoExtractMemory && userMessage) {
      extractMemories(userMessage, finalReply, studio, this.memory).catch(() => {});
    }

    return {
      reply: finalReply,
      toolCalls: toolCallTraces,
      sessionId,
    };
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
