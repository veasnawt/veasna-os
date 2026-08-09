import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server.js + pruned node_modules — required so the Electron desktop app
  // (apps/desktop) can bundle and run this server without the pnpm-symlinked workspace tree.
  output: "standalone",
  // @veasna/ai (and its better-sqlite3 native-module workarounds) used to be needed here for
  // Rixie's chat (app/api/agent) — that moved into studios/universe's own server, so bp no
  // longer depends on it at all.
  transpilePackages: ["@veasna/universe", "@veasnawt/vicons"],
};

export default nextConfig;
