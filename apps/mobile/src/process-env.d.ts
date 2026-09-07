// packages/vcut and packages/auth are SHARED code, also consumed by studios/vcut's Next.js/webpack
// build — which polyfills bare `process.env.X` reads at build time — and this app's own Vite
// bundler, which does NOT provide a `process` global by default (there genuinely is no Node process
// in a Capacitor WebView). vite.config.ts's own `define` block replaces every reference this app's
// bundle actually reaches with a literal value at build time (so the RUNTIME bundle never contains
// a dangling `process` reference that would throw), but that's a bundler-time text substitution —
// completely invisible to `tsc -b`'s own, separate type-checking pass, which still needs `process`
// to be a recognized symbol to typecheck the same source. This is deliberately NOT `@types/node`
// (already an installed dependency, but pulling in its full ambient ProcessEnv/Process surface would
// misrepresent this as a real Node runtime, when only `process.env.<key>` reads are ever meant to
// exist here) — just enough of a shape to typecheck what this app's own dependency graph actually
// references.
declare const process: { env: Record<string, string | undefined> };
