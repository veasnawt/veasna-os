import {
  LLMProvider,
  ProviderRequestOptions,
  ProviderResponse,
  ToolCall,
} from "./types";

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export class OpenAIProvider implements LLMProvider {
  name: string;
  private apiKey: string;
  private baseURL: string;

  constructor(apiKey: string, baseURL?: string, providerName = "openai") {
    this.apiKey = apiKey;
    this.baseURL = (baseURL || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.name = providerName;
  }

  async chat(options: ProviderRequestOptions): Promise<ProviderResponse> {
    const messages: OpenAIChatMessage[] = [];

    if (options.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }

    for (const msg of options.messages) {
      if (msg.role === "user") {
        messages.push({ role: "user", content: msg.content || "" });
      } else if (msg.role === "assistant") {
        const item: OpenAIChatMessage = { role: "assistant", content: msg.content || null };
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          item.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.input),
            },
          }));
        }
        messages.push(item);
      } else if (msg.role === "tool") {
        messages.push({
          role: "tool",
          tool_call_id: msg.toolCallId || "",
          name: msg.toolName,
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        });
      }
    }

    const tools: OpenAITool[] | undefined = options.tools
      ? options.tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }))
      : undefined;

    const payload: Record<string, unknown> = {
      model: options.model || "gpt-4o",
      messages,
      max_tokens: options.maxTokens || 2048,
    };

    if (tools && tools.length > 0) {
      payload.tools = tools;
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI Provider (${this.name}) HTTP error ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: "function";
            function: {
              name: string;
              arguments: string;
            };
          }>;
        };
      }>;
    };

    const choice = data.choices?.[0]?.message;
    if (!choice) {
      throw new Error(`No choices returned from ${this.name} API response.`);
    }

    const text = choice.content || "";
    const toolCalls: ToolCall[] = [];

    if (choice.tool_calls) {
      for (const tc of choice.tool_calls) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments || "{}");
        } catch {
          input = { raw: tc.function.arguments };
        }
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          input,
        });
      }
    }

    return { text: text.trim(), toolCalls };
  }
}
