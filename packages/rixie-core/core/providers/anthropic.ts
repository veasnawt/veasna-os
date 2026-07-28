import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import {
  LLMProvider,
  ProviderRequestOptions,
  ProviderResponse,
  ToolCall,
} from "./types";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error(
        "Anthropic API key is missing. Set ANTHROPIC_API_KEY in your environment."
      );
    }
    this.client = new Anthropic({ apiKey });
  }

  async chat(options: ProviderRequestOptions): Promise<ProviderResponse> {
    const formattedMessages = this.formatMessages(options.messages);
    const formattedTools = options.tools ? this.formatTools(options.tools) : undefined;

    const response = await this.client.messages.create({
      model: options.model || "claude-sonnet-5",
      max_tokens: options.maxTokens || 2048,
      system: options.systemPrompt,
      tools: formattedTools,
      messages: formattedMessages,
    });

    let text = "";
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: (block.input as Record<string, unknown>) || {},
        });
      }
    }

    return { text: text.trim(), toolCalls };
  }

  private formatTools(tools: ProviderRequestOptions["tools"] = []): Tool[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Tool["input_schema"],
    }));
  }

  private formatMessages(messages: ProviderRequestOptions["messages"]): MessageParam[] {
    const formatted: MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === "user") {
        formatted.push({ role: "user", content: msg.content || "" });
      } else if (msg.role === "assistant") {
        const contentBlocks: MessageParam["content"] = [];

        if (msg.content) {
          contentBlocks.push({ type: "text", text: msg.content });
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            contentBlocks.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: tc.input,
            });
          }
        }
        formatted.push({ role: "assistant", content: contentBlocks });
      } else if (msg.role === "tool") {
        const toolResult: ToolResultBlockParam = {
          type: "tool_result",
          tool_use_id: msg.toolCallId || "",
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        };
        
        // Append to last user message if last message was user, else push new user turn
        const lastMsg = formatted[formatted.length - 1];
        if (lastMsg && lastMsg.role === "user" && Array.isArray(lastMsg.content)) {
          (lastMsg.content as ToolResultBlockParam[]).push(toolResult);
        } else {
          formatted.push({ role: "user", content: [toolResult] });
        }
      }
    }

    return formatted;
  }
}
