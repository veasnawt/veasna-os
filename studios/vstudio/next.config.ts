import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server.js + pruned node_modules — required so the Electron desktop app
  // (apps/desktop) can bundle and run this server without the pnpm-symlinked workspace tree.
  output: "standalone",
  // Next.js 16 blocks cross-origin requests to dev-only resources (webpack-hmr's own WebSocket, in
  // particular) by default — anything not exactly "localhost" is treated as cross-origin, including
  // 127.0.0.1 and a LAN IP. Without this, a phone (or anything hitting the LAN-IP API access
  // `_lib/localOnly.ts` deliberately allows) gets a blocked HMR socket, which in turn makes EVERY
  // page request in dev mode extremely slow (~15-20s instead of milliseconds) rather than a clean
  // failure — confirmed live, not just from the docs. 127.0.0.1 covers this machine's own non-
  // "localhost" tooling (curl/Playwright); the LAN IP is this dev machine's own address on the local
  // network as of writing — DHCP can reassign it, so update this if phone/LAN testing goes slow again
  // after a network change.
  allowedDevOrigins: ["127.0.0.1", "192.168.1.18"],
  // @veasnawt/vicons is consumed as SOURCE too (not its built dist) so a new icon the icon package's
  // own maintainer adds shows up here on the next save, no separate `pnpm build`/publish step needed
  // in between — same reasoning as @veasna/vstudio itself.
  transpilePackages: ["@veasna/vstudio", "@veasnawt/vicons"],
  // ffmpeg-static/ffprobe-static ship prebuilt BINARIES and locate them by resolving a path relative
  // to their own package directory. Bundling them rewrites that resolution and the binary path comes
  // out wrong at runtime, so they have to stay external — the same problem, and the same fix, as
  // better-sqlite3 in studios/universe/next.config.ts. `serverExternalPackages` alone isn't enough
  // here (it doesn't cover every import path webpack takes), so externals are set directly too.
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "ffmpeg-static", "ffprobe-static"];
    }
    return config;
  },
};

export default nextConfig;
