// Builds VCut Desktop: studios/vcut's standalone Next.js build, then the Electron installer.
//
// The desktop app has no deploy-time environment of its own, so the PUBLIC Supabase client settings
// (the ones vcut.io already ships to every browser) come from scripts/vcut-public-auth.json and are
// baked into the build here. Without them `getSupabaseBrowserClient()` is null in the app and signing in
// quietly does nothing. Values already set in the environment win, so a build can point elsewhere.
//
//   pnpm build:vcut-desktop
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicAuth = JSON.parse(readFileSync(path.join(repoRoot, "scripts", "vcut-public-auth.json"), "utf8"));

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || publicAuth.supabaseUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || publicAuth.supabaseAnonKey,
};

function run(args) {
  console.log(`\n> pnpm ${args.join(" ")}`);
  const result = spawnSync("pnpm", args, { cwd: repoRoot, env, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["--filter", "vcut", "build"]);
run(["--filter", "@veasnawt/vcut-desktop", "package"]);
