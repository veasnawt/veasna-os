import { OpenAIProvider } from "./openai";
import {
  LLMProvider,
  ProviderRequestOptions,
  ProviderResponse,
} from "./types";

export class GeminiProvider implements LLMProvider {
  name = "gemini";
  private openAIAdapter: OpenAIProvider;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Gemini API key is missing. Set GEMINI_API_KEY in your environment.");
    }
    // Google Gemini provides a official OpenAI-compatible endpoint!
    this.openAIAdapter = new OpenAIProvider(
      apiKey,
      "https://generativelanguage.googleapis.com/v1beta/openai/",
      "gemini"
    );
  }

  async chat(options: ProviderRequestOptions): Promise<ProviderResponse> {
    const model = options.model.includes("gemini")
      ? options.model
      : "gemini-2.0-flash";
    return this.openAIAdapter.chat({ ...options, model });
  }
}
