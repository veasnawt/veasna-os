// Copies each studio's `.env.example` to `.env.local` if one doesn't already exist yet — plain
// Node.js (not a shell `cp`/`copy` command) specifically so this works identically on Windows,
// macOS, and Linux without needing a Bash-only or cmd-only script. Never overwrites a `.env.local`
// that's already there, so re-running `pnpm setup` later is always safe.
const fs = require("fs");
const path = require("path");

const ENV_PAIRS = [{ example: "studios/bp/.env.example", target: "studios/bp/.env.local" }];

let createdAny = false;

for (const { example, target } of ENV_PAIRS) {
  const exampleAbs = path.resolve(__dirname, "..", example);
  const targetAbs = path.resolve(__dirname, "..", target);

  if (!fs.existsSync(exampleAbs)) continue;
  if (fs.existsSync(targetAbs)) {
    console.log(`  ${target} already exists — leaving it alone.`);
    continue;
  }

  fs.copyFileSync(exampleAbs, targetAbs);
  createdAny = true;
  console.log(`  Created ${target} from ${example}.`);
}

if (createdAny) {
  console.log("\nSetup created new .env.local file(s) with placeholder values.");
  console.log("Open studios/bp/.env.local and fill in your own API key before running BP Studio's agent chat.");
  console.log("(Everything else works without it — see README's Security section for what's optional.)\n");
} else {
  console.log("\nAll .env.local files already exist — nothing to set up.\n");
}
