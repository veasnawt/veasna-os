import { Rixie } from "../core";

async function main() {
  console.log("--- Programmatic Rixie SDK Demo ---\n");

  // 1. Fluent Builder Pattern (Ollama / Local LLM)
  const ollamaAgent = Rixie.builder()
    .withOllama("http://localhost:11434/v1", "llama3.1")
    .withSystemPrompt("You are Rixie operating in quiet developer mode.")
    .build();

  // Programmatic Memory Injection
  ollamaAgent.remember("User prefers short 15-second video formats", "bp", "style_pref");

  console.log("Memory Search Test:");
  const memories = ollamaAgent.searchMemory("short video");
  console.log(memories);

  // 2. Convenience Factory Shortcuts
  // const anthropicAgent = Rixie.createAnthropic({ apiKey: "sk-ant-...", model: "claude-3-5-sonnet-latest" });
  // const openAIAgent = Rixie.createOpenAI({ apiKey: "sk-...", model: "gpt-4o" });
  // const geminiAgent = Rixie.createGemini({ apiKey: "AIza...", model: "gemini-2.0-flash" });

  console.log("\nProgrammatic API setup complete!");
}

main().catch(console.error);
