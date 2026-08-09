import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server.js + pruned node_modules — required so the Electron desktop app
  // (apps/desktop) can bundle and run this server without the pnpm-symlinked workspace tree.
  output: "standalone",
  transpilePackages: ["@veasna/ai", "@veasna/universe", "@veasnawt/vicons"],
  // better-sqlite3 is a native module — bundling it via transpilePackages breaks its
  // compiled-binary lookup at runtime (the `bindings` package locates the .node file
  // by walking the call stack, which webpack's bundled stack traces break). This is
  // reached transitively through @veasna/ai, so serverExternalPackages alone doesn't
  // catch it — force it via webpack externals directly.
  serverExternalPackages: ["better-sqlite3"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "better-sqlite3", "bindings"];
    }
    return config;
  },
};

export default nextConfig;
