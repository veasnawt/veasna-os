import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@veasna/universe", "@react-three/fiber", "@react-three/drei", "three"],
  // The dev indicator badge sits bottom-left by default, exactly where the desktop
  // shell's Windows-style Start button belongs — disable it rather than compromise the UI.
  devIndicators: false,
  // Self-contained server.js + pruned node_modules — required so the Electron desktop app
  // (apps/desktop) can bundle and run this server without the pnpm-symlinked workspace tree.
  output: "standalone",
};

export default nextConfig;
