/**
 * Generic memory tools — not tied to a single studio. Lets the agent
 * explicitly search or write to shared memory when a request needs
 * cross-studio recall (e.g. "use the music track from last week's session").
 */
import { MemoryStore } from "../memory/memoryStore";
import { ToolModule } from "./types";

export function registerMemoryTools(memory: MemoryStore): ToolModule {
  function searchMemory(input: { query: string; studio?: string; limit?: number }) {
    const { query, studio, limit = 10 } = input;
    return { results: memory.search(query, studio || undefined, limit) };
  }

  function remember(input: { studio: string; kind: string; content: string }) {
    const { studio, kind, content } = input;
    const id = memory.add(studio, kind, content);
    return { id, status: "stored" };
  }

  return {
    schemas: [
      {
        name: "search_memory",
        description: "Search stored project memory across studios (or one studio) by keyword.",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string" },
            studio: { type: "string", description: "'bp' | 'art' | 'music' | 'gamedev' | '' for all" },
            limit: { type: "number" },
          },
          required: ["query"],
        },
      },
      {
        name: "remember",
        description: "Store a durable fact/preference/state note in shared memory for later recall.",
        input_schema: {
          type: "object",
          properties: {
            studio: { type: "string" },
            kind: { type: "string" },
            content: { type: "string" },
          },
          required: ["studio", "kind", "content"],
        },
      },
    ],
    dispatch: {
      search_memory: searchMemory,
      remember,
    },
  };
}
