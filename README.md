# 🌌 Veasna OS

> Welcome home.

Veasna OS is not a productivity app.

It is a universe where creators build ideas, music, games, apps, stories and dreams.

Every project is a world.

Every idea is a star.

Every creation begins with curiosity.

---

## The Shell

The front door to Veasna OS is **Universe** — a desktop-style shell with two faces:

- 🌌 **3D mode** — each studio is a celestial body orbiting in a living cosmos, click one to open it.
- 🖥️ **List mode** — a familiar Windows-style desktop: draggable/resizable windows, a taskbar with pinning and auto-hide, a Start menu, folders and files you can create right on the desktop.

Both modes share the same window system, so switching between them never loses what you have open.

---

## Studios

| Studio | What it is | Status |
| --- | --- | --- |
| 🌌 Universe | The OS shell itself — 3D cosmos + desktop | Active |
| 🎬 BP Studio | Beyond Perspective — idea → script → create → publish | Active |
| 🎮 Game Dev | Loom Engine — a browser-based 2D game engine/editor with its own scripting DSL | Active |
| 🎵 Music | — | Coming soon |
| 🎨 Art | — | Coming soon |
| 🌍 Language | — | Coming soon |

---

## Monorepo Layout

A pnpm workspace: each studio is its own app, shared code lives in packages.

```
studios/
  universe/    the OS shell (Next.js) — default entry point
  bp/          Beyond Perspective
  gamedev/     Loom Engine (Vite)

packages/
  universe/    shell UI: desktop, windows, taskbar, settings, cosmos
  ai/          shared AI utilities
  ui/, auth/, database/, storage/, editor/, analytics/, automation/, utils/, vicons/
```

### Running a studio

Requires [Node.js](https://nodejs.org) 20.9+ and [pnpm](https://pnpm.io) (`corepack enable` will install the right pnpm version automatically from this repo's `packageManager` field). **Use an LTS release of Node (currently 22.x), not the latest "Current" one** — see the `better-sqlite3` troubleshooting note below for why.

```bash
git clone --recurse-submodules https://github.com/veasnawt/veasna-os.git
cd veasna-os

pnpm setup    # installs everything + creates studios/bp/.env.local from its template
pnpm dev:all  # everything at once — Universe, BP Studio, and Loom Engine together
```

Already cloned without `--recurse-submodules`? Run `git submodule update --init` to fetch `packages/loom` (otherwise it's just an empty folder — a plain `git clone` never fetches submodule content on its own).

Then open `studios/bp/.env.local` and fill in your own model provider API key (see `studios/bp/.env.example` for the full list of variables) — everything works without one except BP Studio's Rixie agent chat. `pnpm setup` never overwrites a `.env.local` that already exists, so it's safe to re-run any time.

**Windows: if `pnpm setup` fails on `better-sqlite3` with `gyp ERR! find VS` / "Could not find any Visual Studio installation"** — this is the most common install failure on Windows, confirmed from real error output, not a guess. `better-sqlite3` ships prebuilt binaries for common Node versions so it normally never needs to compile anything; the failure only happens when your Node version is newer than what's been prebuilt yet (this repo saw it on Node 24.19.0, a very recent "Current" release, not yet an LTS). Two fixes, pick one:
- **Switch to Node LTS (recommended, no extra installs)** — e.g. with [nvm-windows](https://github.com/coreybutler/nvm-windows): `nvm install 22 && nvm use 22`, then delete `node_modules` and re-run `pnpm setup`. Prebuilt binaries almost always exist for LTS versions, so this avoids compiling anything at all.
- **Or install the real build toolchain** — [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) with the "Desktop development with C++" workload, needed if you specifically want to stay on a newer/non-LTS Node.

**Windows, separately: if the failure instead mentions symlinks, `EPERM`, or "operation not permitted"** — pnpm's `node_modules` relies heavily on symlinks, and Windows only allows creating them for Administrators or accounts with Developer Mode enabled. Fix: **Settings → Privacy & security → For developers → turn on Developer Mode**, then re-run `pnpm setup`.

Or run just what you need:

```bash
pnpm dev          # Universe — http://localhost:3000
pnpm dev:bp       # BP Studio — http://localhost:3001
pnpm dev:gamedev  # Loom Engine — http://localhost:5173
```

Studio windows inside Universe embed the other studios directly (`bp`, `gamedev`) — running them isn't required just to browse Universe itself, but it is required for those specific windows to load anything. `pnpm dev:all` is the easiest way to get everything working at once.

---

## Security

Two of Universe's API routes give it real power over the machine it runs on, and both are guarded accordingly:

- **Terminal** (`/api/terminal`) executes real shell commands with your OS user's own privileges.
- **Files** (`/api/files`) reads/writes the real filesystem — sandboxed to a single `.desktop/` folder at the repo root, so it can't escape that folder, but it's still real disk I/O.

Both routes reject any request that doesn't look like it came directly from `localhost` (see `studios/universe/app/api/_lib/localOnlyGuard.ts`) — but **this is a best-effort guard against accidental exposure, not a hard security boundary.** The real protection is simpler: **never bind Universe's dev/prod server to a public interface** (no `next start -H 0.0.0.0`, no port-forwarding, no reverse proxy, no tunnel like ngrok/Cloudflare Tunnel pointed at it). This project is built for one person running it on their own machine — it was never designed or audited for multi-user or public-internet exposure, and shouldn't be deployed that way.

Secrets (`.env*.local` files, `*.db` files, the `.desktop/` sandbox) are gitignored at the repo root — `git status` should never show them as trackable. If you fork or extend this project, keep that pattern: real credentials go in `.env.local` (never committed), a matching `.env.example` with placeholder values goes in the repo so others know what to set up.

---

## Philosophy

Build tools that make future me smile.

---

## Status

🌌 Age I

The Big Bang

---

## License

[GNU AGPL v3.0](./LICENSE). The short version: you're free to use, modify, and redistribute this — but if you run a modified version as a network service that other people can access, you have to make your modified source available to them too. This is a copyleft license specifically chosen to prevent someone taking this project closed-source as a hosted product.
