import { RixieAgent, RixieAgentOptions } from "./agent/agent";
import {
  LLMProvider,
  AnthropicProvider,
  OpenAIProvider,
  GeminiProvider,
  OllamaProvider,
  ProviderType,
  createProvider,
} from "./providers";

export interface AnthropicConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface OpenAIConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface GeminiConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface OllamaConfig {
  baseURL?: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
}

export class RixieBuilder {
  private providerInstance?: LLMProvider;
  private providerType?: ProviderType | string;
  private anthropicApiKey?: string;
  private openAIApiKey?: string;
  private geminiApiKey?: string;
  private openAIBaseURL?: string;
  private modelName?: string;
  private maxTokensValue?: number;
  private customSystemPrompt?: string;
  private memoryDbPath?: string;

  withProvider(provider: LLMProvider): this {
    this.providerInstance = provider;
    return this;
  }

  withAnthropic(apiKey?: string, model = "claude-sonnet-5"): this {
    this.providerType = "anthropic";
    if (apiKey) this.anthropicApiKey = apiKey;
    this.modelName = model;
    return this;
  }

  withOpenAI(apiKey?: string, model = "gpt-4o", baseURL?: string): this {
    this.providerType = "openai";
    if (apiKey) this.openAIApiKey = apiKey;
    if (baseURL) this.openAIBaseURL = baseURL;
    this.modelName = model;
    return this;
  }

  withGemini(apiKey?: string, model = "gemini-2.0-flash"): this {
    this.providerType = "gemini";
    if (apiKey) this.geminiApiKey = apiKey;
    this.modelName = model;
    return this;
  }

  withOllama(baseURL = "http://localhost:11434/v1", model = "llama3.1"): this {
    this.providerType = "ollama";
    this.openAIBaseURL = baseURL;
    this.modelName = model;
    return this;
  }

  withModel(model: string): this {
    this.modelName = model;
    return this;
  }

  withMaxTokens(tokens: number): this {
    this.maxTokensValue = tokens;
    return this;
  }

  withSystemPrompt(prompt: string): this {
    this.customSystemPrompt = prompt;
    return this;
  }

  withMemoryDB(path: string): this {
    this.memoryDbPath = path;
    return this;
  }

  build(): RixieAgent {
    let provider = this.providerInstance;
    if (!provider) {
      provider = createProvider({
        provider: this.providerType,
        anthropicApiKey: this.anthropicApiKey,
        openAIApiKey: this.openAIApiKey,
        geminiApiKey: this.geminiApiKey,
        openAIBaseURL: this.openAIBaseURL,
      });
    }

    return new RixieAgent({
      provider,
      model: this.modelName,
      maxTokens: this.maxTokensValue,
      systemPrompt: this.customSystemPrompt,
      memoryDbPath: this.memoryDbPath,
    });
  }
}

export class Rixie {
  static builder(): RixieBuilder {
    return new RixieBuilder();
  }

  static create(options: RixieAgentOptions = {}): RixieAgent {
    return new RixieAgent(options);
  }

  static createAnthropic(config: AnthropicConfig = {}): RixieAgent {
    const provider = new AnthropicProvider(
      config.apiKey || process.env.ANTHROPIC_API_KEY || ""
    );
    return new RixieAgent({
      provider,
      model: config.model || "claude-sonnet-5",
      maxTokens: config.maxTokens,
      systemPrompt: config.systemPrompt,
    });
  }

  static createOpenAI(config: OpenAIConfig = {}): RixieAgent {
    const provider = new OpenAIProvider(
      config.apiKey || process.env.OPENAI_API_KEY || "",
      config.baseURL || process.env.OPENAI_BASE_URL,
      "openai"
    );
    return new RixieAgent({
      provider,
      model: config.model || "gpt-4o",
      maxTokens: config.maxTokens,
      systemPrompt: config.systemPrompt,
    });
  }

  static createGemini(config: GeminiConfig = {}): RixieAgent {
    const provider = new GeminiProvider(
      config.apiKey || process.env.GEMINI_API_KEY || ""
    );
    return new RixieAgent({
      provider,
      model: config.model || "gemini-2.0-flash",
      maxTokens: config.maxTokens,
      systemPrompt: config.systemPrompt,
    });
  }

  static createOllama(config: OllamaConfig = {}): RixieAgent {
    const provider = new OllamaProvider(
      config.baseURL || "http://localhost:11434/v1",
      config.apiKey || "ollama"
    );
    return new RixieAgent({
      provider,
      model: config.model || "llama3.1",
      maxTokens: config.maxTokens,
      systemPrompt: config.systemPrompt,
    });
  }
}
