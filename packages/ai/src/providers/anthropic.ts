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

    // 👇 Validate before sending to Anthropic
    this.validateHistory(formattedMessages);

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

  private validateHistory(messages: MessageParam[]) {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;

      const toolUses = msg.content.filter(
        (b: any) => b.type === "tool_use"
      );

      if (toolUses.length === 0) continue;

      const next = messages[i + 1];

      if (!next || next.role !== "user") {
        throw new Error(
          "Assistant tool_use must be immediately followed by tool_result."
        );
      }
    }
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
          tool_use_id: msg.toolCallId!,
          content:
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content),
        };

        // Reuse the previous synthetic tool_result message if we're
        // processing multiple tool results from the same assistant turn.
        const last = formatted[formatted.length - 1];

        const lastIsToolResultMessage =
          last &&
          last.role === "user" &&
          Array.isArray(last.content) &&
          last.content.length > 0 &&
          typeof last.content[0] === "object" &&
          "type" in last.content[0] &&
          last.content[0].type === "tool_result";

        if (lastIsToolResultMessage) {
          (last.content as ToolResultBlockParam[]).push(toolResult);
        } else {
          formatted.push({
            role: "user",
            content: [toolResult],
          });
        }
      }
    }

    return formatted;
  }
}
