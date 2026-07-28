import { LLMProvider, ProviderType } from "./types";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { GeminiProvider } from "./gemini";
import { OllamaProvider } from "./ollama";

export * from "./types";
export { AnthropicProvider } from "./anthropic";
export { OpenAIProvider } from "./openai";
export { GeminiProvider } from "./gemini";
export { OllamaProvider } from "./ollama";

export interface ProviderConfigOptions {
  provider?: ProviderType | string;
  anthropicApiKey?: string;
  openAIApiKey?: string;
  geminiApiKey?: string;
  openAIBaseURL?: string;
}

export function createProvider(config: ProviderConfigOptions = {}): LLMProvider {
  const providerType = (
    config.provider ||
    process.env.RIXIE_PROVIDER ||
    ""
  ).toLowerCase();

  const anthropicKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "";
  const openAIKey = config.openAIApiKey || process.env.OPENAI_API_KEY || "";
  const geminiKey = config.geminiApiKey || process.env.GEMINI_API_KEY || "";
  const baseURL = config.openAIBaseURL || process.env.OPENAI_BASE_URL;

  // Explicit provider selection
  if (providerType === "anthropic") {
    return new AnthropicProvider(anthropicKey);
  }
  if (providerType === "openai") {
    return new OpenAIProvider(openAIKey, baseURL, "openai");
  }
  if (providerType === "gemini") {
    return new GeminiProvider(geminiKey);
  }
  if (providerType === "ollama") {
    return new OllamaProvider(baseURL, openAIKey);
  }
  if (providerType === "openrouter") {
    return new OpenAIProvider(
      openAIKey || process.env.OPENROUTER_API_KEY || "",
      baseURL || "https://openrouter.ai/api/v1",
      "openrouter"
    );
  }

  // Auto-detection based on configured keys
  if (anthropicKey) {
    return new AnthropicProvider(anthropicKey);
  }
  if (openAIKey) {
    return new OpenAIProvider(openAIKey, baseURL, "openai");
  }
  if (geminiKey) {
    return new GeminiProvider(geminiKey);
  }

  // Default fallback to Anthropic
  return new AnthropicProvider(anthropicKey);
}
