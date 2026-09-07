import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @veasnawt/vcut ships as raw TypeScript SOURCE (no build step — see its own package.json's
// "main": "src/index.ts"), the same way studios/vcut's Next.js host consumes it via
// transpilePackages. Vite's dependency pre-bundler assumes node_modules packages are already-built
// JS by default; excluding it here is what makes Vite run its own esbuild transform over that source
// on every request instead, matching what transpilePackages does for the Next.js host.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ["@veasnawt/vcut"],
  },
  // packages/vcut/src/api/client.ts and packages/auth/src/browser.ts read bare `process.env.X` —
  // fine under studios/vcut's Next.js/webpack build, which polyfills that at compile time, but this
  // app has no Node process to read from at all (a Capacitor WebView, not a server): left
  // unreplaced, the bundle would throw `process is not defined` the instant either module runs, not
  // just when NEXT_PUBLIC_VCUT_HOSTED happens to be truthy. See src/process-env.d.ts for the matching
  // type-only half of this fix.
  //
  // NEXT_PUBLIC_VCUT_HOSTED stays hardcoded `"false"` — this app is never the hosted web SERVER and
  // never will be (see `_lib/localOnly.ts`'s own `VCUT_HOSTED` gate, meaningless without a server to
  // gate). The Supabase URL/anon key are DIFFERENT: they're what lets `getSupabaseBrowserClient()`
  // return a working client for `MobileSignInDialog`'s own in-app sign-in (a mobile ACCOUNT is a real
  // thing now — see that dialog and `packages/vcut/src/api/billing.ts` — even though this app is
  // still never "hosted" itself). Read from real env vars at build time (`SUPABASE_URL_MOBILE` NOT
  // `NEXT_PUBLIC_SUPABASE_URL` — that name is reserved for Next's own inlining convention, which has
  // no meaning in a Vite build), falling back to `"undefined"` so a build that doesn't set them still
  // works exactly as before (no accounts offered, same as this app's whole history until now). The
  // anon key is safe to bake into a public bundle by design — same reasoning as studios/vcut's own
  // `.env.example` comment on it — RLS is what actually protects data, not keeping this secret.
  define: {
    "process.env.NEXT_PUBLIC_VCUT_HOSTED": '"false"',
    // Each `define` value here must itself be a STRING of raw JS source to splice in — `"undefined"`
    // (the string) splices in the bare identifier `undefined`; `JSON.stringify(realValue)` splices in
    // a properly quoted string literal. Not simply `JSON.stringify(envVar ?? undefined)` — that
    // returns the actual `undefined` VALUE (not a string) when the env var is unset, which `define`
    // can't use as replacement text at all.
    "process.env.NEXT_PUBLIC_SUPABASE_URL": process.env.SUPABASE_URL_MOBILE ? JSON.stringify(process.env.SUPABASE_URL_MOBILE) : "undefined",
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": process.env.SUPABASE_ANON_KEY_MOBILE
      ? JSON.stringify(process.env.SUPABASE_ANON_KEY_MOBILE)
      : "undefined",
  },
});
