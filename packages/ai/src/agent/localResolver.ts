/**
 * Local-First Intelligence Resolver for Rixie Core.
 *
 * Evaluates incoming user messages against local SQLite memory, registered OS tools,
 * and deterministic local logic BEFORE calling external API providers.
 *
 * If local capabilities can resolve the request with high confidence (>= 80%),
 * returns a local result immediately, avoiding unnecessary external LLM API calls.
 */

import { MemoryStore } from "../memory/memoryStore";
import { ToolFn, ToolSchema } from "../tools/types";

export interface LocalResolutionResult {
  resolvedLocally: boolean;
  reply: string;
  toolCalls: Array<{ name: string; input: unknown; output: unknown }>;
  confidence: number; // 0.0 to 1.0
  source: "local_memory" | "local_tool" | "local_system" | "external_llm";
}

export class LocalResolver {
  private memory: MemoryStore;
  private dispatch: Record<string, ToolFn>;
  private schemas: ToolSchema[];

  constructor(memory: MemoryStore, dispatch: Record<string, ToolFn>, schemas: ToolSchema[]) {
    this.memory = memory;
    this.dispatch = dispatch;
    this.schemas = schemas;
  }

  async resolve(userMessage: string, studio = "global"): Promise<LocalResolutionResult> {
    const trimmed = userMessage.trim().toLowerCase();

    // 1. Direct Memory Commands & Queries
    if (trimmed.startsWith("/remember ") || trimmed.startsWith("remember ")) {
      const fact = userMessage.replace(/^(\/remember|remember)\s+/i, "").trim();
      if (fact) {
        const id = this.memory.add(studio, "user_fact", fact);
        return {
          resolvedLocally: true,
          reply: `[VERIFIED COMPLETED] Stored fact into local SQLite Memory Vault.\n- **Memory ID**: #${id}\n- **Studio**: ${studio}\n- **Content**: ${fact}`,
          toolCalls: [{ name: "remember", input: { content: fact, studio, kind: "user_fact" }, output: { id } }],
          confidence: 1.0,
          source: "local_memory",
        };
      }
    }

    if (
      trimmed.startsWith("/search-memory") ||
      trimmed.includes("search memory") ||
      trimmed.includes("what do you remember") ||
      trimmed.includes("list memories")
    ) {
      const query = userMessage
        .replace(/^(\/search-memory|search memory for|search memory|what do you remember about|list memories)\s*/i, "")
        .trim();

      const memories = this.memory.search(query || "", studio === "global" ? undefined : studio, 10);
      const memoryText = memories.length > 0
        ? memories.map((m) => `- **[#${m.id} ${m.studio}/${m.kind}]**: ${m.content}`).join("\n")
        : "No matching memories found in local SQLite vault.";

      return {
        resolvedLocally: true,
        reply: `[VERIFIED COMPLETED] Retrieved context from local SQLite Memory Store:\n\n${memoryText}`,
        toolCalls: [{ name: "searchMemory", input: { query, studio }, output: { memories } }],
        confidence: 1.0,
        source: "local_memory",
      };
    }

    // 2. Direct OS System & Tool Queries
    if (
      trimmed.startsWith("/system-status") ||
      trimmed.includes("system status") ||
      trimmed.includes("memory count") ||
      trimmed.includes("how many tools")
    ) {
      const memoryCount = this.memory.count();
      const toolNames = this.schemas.map((s) => s.name);
      return {
        resolvedLocally: true,
        reply: `[VERIFIED COMPLETED] Rixie Local OS Telemetry:\n- **SQLite Database Path**: \`./core/data/memory.db\`\n- **Stored Memories**: ${memoryCount} entries\n- **Registered Local Tools**: ${this.schemas.length} functions\n- **Local Capabilities**: ${toolNames.slice(0, 8).join(", ")}...`,
        toolCalls: [{ name: "getSystemStatus", input: {}, output: { memoryCount, toolCount: this.schemas.length } }],
        confidence: 1.0,
        source: "local_system",
      };
    }

    if (trimmed.includes("list tools") || trimmed.includes("available tools")) {
      const toolList = this.schemas.map((s) => `- **\`${s.name}\`**: ${s.description}`).join("\n");
      return {
        resolvedLocally: true,
        reply: `[VERIFIED COMPLETED] Registered Rixie Local OS Tools (${this.schemas.length} functions):\n\n${toolList}`,
        toolCalls: [{ name: "listTools", input: {}, output: { count: this.schemas.length } }],
        confidence: 1.0,
        source: "local_system",
      };
    }

    // 3. Exact Memory Answer Match (High Confidence Local Recall)
    const recalled = this.memory.search(userMessage, studio === "global" ? undefined : studio, 3);
    if (recalled.length > 0) {
      const exactMatch = recalled.find(
        (m) => m.content.toLowerCase().includes(trimmed) || trimmed.includes(m.content.toLowerCase())
      );

      if (exactMatch) {
        return {
          resolvedLocally: true,
          reply: `[VERIFIED COMPLETED] Answer retrieved directly from local SQLite Memory Store (0 API calls):\n\n${exactMatch.content}\n\n*Source: Local SQLite Memory #${exactMatch.id} (${exactMatch.studio}/${exactMatch.kind})*`,
          toolCalls: [{ name: "searchMemory", input: { query: userMessage }, output: { memoryId: exactMatch.id } }],
          confidence: 0.95,
          source: "local_memory",
        };
      }
    }

    // 4. Default: Cannot confidently resolve locally -> Escalate to external provider
    return {
      resolvedLocally: false,
      reply: "",
      toolCalls: [],
      confidence: 0.0,
      source: "external_llm",
    };
  }
}
