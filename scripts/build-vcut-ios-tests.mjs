import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../apps/mobile/node_modules/vite/dist/node/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
await build({
  configFile: false,
  root,
  publicDir: false,
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_VCUT_HOSTED": '"false"',
    "process.env.NEXT_PUBLIC_SUPABASE_URL": "undefined",
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": "undefined",
  },
  build: {
    outDir: resolve(root, "apps/mobile/ios/App/AppTests/Generated"),
    emptyOutDir: true,
    lib: { entry: resolve(root, "apps/mobile/tests/native-library-harness.ts"), name: "IOSLibraryTests", formats: ["iife"], fileName: () => "NativeLibraries.js" },
  },
});
