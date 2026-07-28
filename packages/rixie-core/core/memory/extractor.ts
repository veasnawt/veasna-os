/**
 * Automatic Memory Extractor for Rixie Core.
 *
 * Analyzes conversation turns to automatically extract user preferences,
 * project decisions, facts, and creative choices into MemoryStore without
 * requiring explicit user commands.
 *
 * Keeps dependencies at zero (pure regex / pattern analysis + provider-agnostic LLM extraction).
 */
import { MemoryStore } from "./memoryStore";

// Rule-based fast extraction patterns (zero latency, zero API calls)
const FACT_PATTERNS = [
  /i (?:prefer|like|want|love|hate|always use|never use) (.+)/i,
  /(?:my|our) (?:project|brand|video|style|color|target|app) (?:is|uses|requires|needs) (.+)/i,
  /remember (?:that )?(.+)/i,
  /keep in mind (?:that )?(.+)/i,
  /(?:the|our) (?:deadline|bpm|genre|resolution|framerate|ratio) is (.+)/i,
];

export async function extractMemories(
  userMessage: string,
  replyText: string,
  studio = "global",
  memoryStore: MemoryStore
): Promise<number> {
  let count = 0;
  const lines = userMessage.split(/\n+/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    for (const pattern of FACT_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        const extractedFact = trimmed;
        // Avoid duplicate saves
        const existing = memoryStore.search(extractedFact, studio, 1);
        if (existing.length === 0 || existing[0].content !== extractedFact) {
          memoryStore.add(
            studio,
            "auto_extracted_preference",
            extractedFact,
            { source: "auto_extractor", timestamp: Date.now() }
          );
          count++;
        }
        break; // Match found for this line
      }
    }
  }

  return count;
}
