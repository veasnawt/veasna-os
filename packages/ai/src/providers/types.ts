/**
 * Universal Provider-Agnostic LLM Interfaces for Rixie Core.
 *
 * Supports Anthropic, OpenAI, Google Gemini, Ollama, OpenRouter, Groq, DeepSeek, etc.
 */

export type ProviderType =
  | "anthropic"
  | "openai"
  | "gemini"
  | "ollama"
  | "openrouter"
  | "custom";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ProviderMessage {
  role: "user" | "assistant" | "tool";
  content?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
}

export interface ProviderTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema format
}

export interface ProviderRequestOptions {
  model: string;
  systemPrompt?: string;
  maxTokens?: number;
  messages: ProviderMessage[];
  tools?: ProviderTool[];
}

export interface ProviderResponse {
  text: string;
  toolCalls: ToolCall[];
}

export interface LLMProvider {
  name: string;
  chat(options: ProviderRequestOptions): Promise<ProviderResponse>;
}
