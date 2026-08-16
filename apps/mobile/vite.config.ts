import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @veasna/vstudio ships as raw TypeScript SOURCE (no build step — see its own package.json's
// "main": "src/index.ts"), the same way studios/vstudio's Next.js host consumes it via
// transpilePackages. Vite's dependency pre-bundler assumes node_modules packages are already-built
// JS by default; excluding it here is what makes Vite run its own esbuild transform over that source
// on every request instead, matching what transpilePackages does for the Next.js host.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ["@veasna/vstudio"],
  },
});
