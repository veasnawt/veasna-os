import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@veasnawt/vicons", "@veasnawt/integrations"],
};

export default nextConfig;
