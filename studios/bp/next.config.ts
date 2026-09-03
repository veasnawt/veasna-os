import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server.js + pruned node_modules — required so the Electron desktop app
  // (apps/desktop) can bundle and run this server without the pnpm-symlinked workspace tree.
  output: "standalone",
  // @veasnawt/ai (and its better-sqlite3 native-module workarounds) used to be needed here for
  // Rixie's chat (app/api/agent) — that moved into studios/universe's own server, so bp no
  // longer depends on it at all. @veasnawt/vcut moved out too, once VCut became its own
  // standalone app (studios/vcut) that this app embeds via iframe instead of hosting.
  transpilePackages: ["@veasnawt/universe", "@veasnawt/vicons"],
};

export default nextConfig;
