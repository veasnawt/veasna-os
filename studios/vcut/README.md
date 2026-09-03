# 🎞️ VCut

The standalone app that hosts [`@veasnawt/vcut`](../../packages/vcut) — the video editor itself.
See that package's [README](../../packages/vcut/README.md) for what the editor can actually do,
and its [ARCHITECTURE.md](../../packages/vcut/ARCHITECTURE.md) for how it's built.

This app's own job is small on purpose: it's a real Next.js host, not just a page. It provides

- `/` — VCut's own home page (list/create projects, no other studio involved)
- `/edit?projectId=&projectName=` — the editor itself (`<VCutApp>`)
- `/api/vcut/*` — project save/load, media import, FFmpeg export + progress, bundled fonts

Two other places in Veasna OS reach VCut through this app rather than owning any of the above
themselves:

- **BP Studio**'s Create stage embeds it via `<iframe src="${vcutUrl}/edit?...">` — see
  `studios/bp/app/api/vcut-url/route.ts` for how it resolves this app's real URL.
- **Universe** (the OS desktop shell) lists VCut as its own launchable studio — a desktop icon
  that opens a window pointed at `/` here, exactly like BP Studio and Loom Engine.

## Running it

```bash
pnpm dev:vcut   # http://localhost:3002
```

## Tests

Unit tests live in `packages/vcut/tests` and cover the pure editing/export logic, not this app's
own routes directly:

```bash
pnpm --filter @veasnawt/vcut test
```
