import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@veasna/universe", "@react-three/fiber", "@react-three/drei", "three", "@veasna/ai", "@veasnawt/vicons"],
  // better-sqlite3 (Rixie's persistent memory, via @veasna/ai) is a native module — bundling it
  // via transpilePackages breaks its compiled-binary lookup at runtime (the `bindings` package
  // locates the .node file by walking the call stack, which webpack's bundled stack traces
  // break). Reached transitively through @veasna/ai, so serverExternalPackages alone doesn't
  // catch it — force it via webpack externals directly. Mirrors studios/bp/next.config.ts's
  // identical setup, from when Rixie's chat lived there instead.
  serverExternalPackages: ["better-sqlite3"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "better-sqlite3", "bindings"];
    }
    return config;
  },
  // The dev indicator badge sits bottom-left by default, exactly where the desktop
  // shell's Windows-style Start button belongs — disable it rather than compromise the UI.
  devIndicators: false,
  // Self-contained server.js + pruned node_modules — required so the Electron desktop app
  // (apps/desktop) can bundle and run this server without the pnpm-symlinked workspace tree.
  output: "standalone",
};

export default nextConfig;
