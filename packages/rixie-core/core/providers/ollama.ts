import { OpenAIProvider } from "./openai";
import {
  LLMProvider,
  ProviderRequestOptions,
  ProviderResponse,
} from "./types";

export class OllamaProvider implements LLMProvider {
  name = "ollama";
  private adapter: OpenAIProvider;

  constructor(baseURL = "http://localhost:11434/v1", apiKey = "ollama") {
    // Ollama exposes a native OpenAI-compatible API on /v1/chat/completions
    this.adapter = new OpenAIProvider(apiKey, baseURL, "ollama");
  }

  async chat(options: ProviderRequestOptions): Promise<ProviderResponse> {
    const model = options.model || "llama3.1";
    return this.adapter.chat({ ...options, model });
  }
}
