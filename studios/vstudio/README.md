# 🎞️ VStudio

The standalone app that hosts [`@veasna/vstudio`](../../packages/vstudio) — the video editor itself.
See that package's [README](../../packages/vstudio/README.md) for what the editor can actually do,
and its [ARCHITECTURE.md](../../packages/vstudio/ARCHITECTURE.md) for how it's built.

This app's own job is small on purpose: it's a real Next.js host, not just a page. It provides

- `/` — VStudio's own home page (list/create projects, no other studio involved)
- `/edit?projectId=&projectName=` — the editor itself (`<VStudioApp>`)
- `/api/vstudio/*` — project save/load, media import, FFmpeg export + progress, bundled fonts

Two other places in Veasna OS reach VStudio through this app rather than owning any of the above
themselves:

- **BP Studio**'s Create stage embeds it via `<iframe src="${vstudioUrl}/edit?...">` — see
  `studios/bp/app/api/vstudio-url/route.ts` for how it resolves this app's real URL.
- **Universe** (the OS desktop shell) lists VStudio as its own launchable studio — a desktop icon
  that opens a window pointed at `/` here, exactly like BP Studio and Loom Engine.

## Running it

```bash
pnpm dev:vstudio   # http://localhost:3002
```

## Tests

Unit tests live in `packages/vstudio/tests` and cover the pure editing/export logic, not this app's
own routes directly:

```bash
pnpm --filter @veasna/vstudio test
```
