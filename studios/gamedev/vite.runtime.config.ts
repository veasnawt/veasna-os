import { defineConfig } from 'vite'
import { resolve } from 'path'

// Bundles the Loom language + game engine (lexer/parser/interpreter/gameEngine --
// deliberately NOT presets.ts, which is Studio-only content) into a single
// dependency-free IIFE at public/loom-runtime.js. Vite serves public/ verbatim in
// both dev and prod, so ExportModal can fetch it at /loom-runtime.js in either mode.
// Regenerate with `npm run build:runtime` after changing anything under src/loom/
// (other than presets.ts). The main `npm run build` already does this automatically.
export default defineConfig({
  // outDir is public/ itself, so there's nothing for Vite to separately copy in.
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/loom/runtimeEntry.ts'),
      name: 'LoomRuntime',
      formats: ['iife'],
      fileName: () => 'loom-runtime.js',
    },
    minify: true,
  },
})
