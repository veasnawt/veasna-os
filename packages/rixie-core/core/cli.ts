/**
 * Standalone CLI to chat with Rixie Agent with dynamic provider & model switching.
 *
 * Commands:
 *   /provider <anthropic|openai|gemini|ollama> (or /p <name>)
 *   /model <model-name> (or /m <name>)
 *   /status - show current active provider & model
 *   reset - clear conversation history
 *   exit / quit - exit CLI
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import * as readline from "readline";
import { RixieAgent } from "./agent/agent";
import { createProvider } from "./providers";

async function main() {
  let currentProvider = process.env.RIXIE_PROVIDER || "anthropic";
  let currentModel = process.env.RIXIE_MODEL || "claude-sonnet-5";

  console.log("=================================================");
  console.log("  Rixie Agent Interactive Console");
  console.log(`  Active Provider: ${currentProvider} | Model: ${currentModel}`);
  console.log("-------------------------------------------------");
  console.log("  Slash commands:");
  console.log("    /provider <anthropic|openai|gemini|ollama>  (switch provider)");
  console.log("    /model <model-name>                       (switch model)");
  console.log("    /status                                   (show config)");
  console.log("    reset                                     (clear history)");
  console.log("    exit                                      (quit)");
  console.log("=================================================\n");

  let agent = new RixieAgent({
    provider: createProvider({ provider: currentProvider }),
    model: currentModel,
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, resolve));

  while (true) {
    const input = (await ask(`[${currentProvider}:${currentModel}] you> `)).trim();
    if (!input) continue;

    const lower = input.toLowerCase();
    if (lower === "exit" || lower === "quit") break;

    if (lower === "reset") {
      agent.reset();
      console.log("(conversation history cleared)\n");
      continue;
    }

    if (lower === "/status") {
      console.log(`\nActive Provider: ${currentProvider}`);
      console.log(`Active Model:    ${currentModel}\n`);
      continue;
    }

    if (lower.startsWith("/provider ") || lower.startsWith("/p ")) {
      const parts = input.split(/\s+/);
      const newProvider = parts[1]?.toLowerCase();

      if (!newProvider) {
        console.log("Usage: /provider <anthropic|openai|gemini|ollama>\n");
        continue;
      }

      try {
        currentProvider = newProvider;
        if (newProvider === "anthropic") currentModel = "claude-sonnet-5";
        if (newProvider === "openai") currentModel = "gpt-4o";
        if (newProvider === "gemini") currentModel = "gemini-2.0-flash";
        if (newProvider === "ollama") currentModel = "llama3.1";

        agent = new RixieAgent({
          provider: createProvider({ provider: currentProvider }),
          model: currentModel,
        });

        console.log(` Switched active provider to: ${currentProvider} (${currentModel})\n`);
      } catch (err) {
        console.error(` Error switching provider: ${err instanceof Error ? err.message : String(err)}\n`);
      }
      continue;
    }

    if (lower.startsWith("/model ") || lower.startsWith("/m ")) {
      const parts = input.split(/\s+/);
      const newModel = parts[1];

      if (!newModel) {
        console.log("Usage: /model <model-name>\n");
        continue;
      }

      currentModel = newModel;
      agent.setModel(newModel);
      console.log(` Switched active model to: ${currentModel}\n`);
      continue;
    }

    try {
      const { reply, toolCalls } = await agent.chat(input);
      for (const call of toolCalls) {
        console.log(`  [tool] ${call.name}(${JSON.stringify(call.input)})`);
      }
      console.log(`\nagent> ${reply}\n`);
    } catch (err) {
      console.error(`\n[error] ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
