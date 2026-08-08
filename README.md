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

```bash
pnpm install

pnpm dev          # Universe — http://localhost:3000
pnpm dev:bp       # BP Studio — http://localhost:3001
pnpm dev:gamedev  # Loom Engine — http://localhost:5173
```

Studio windows inside Universe embed the other studios directly (`bp`, `gamedev`) — running them isn't required just to browse Universe itself, but it is required for those specific windows to load anything.

---

## Philosophy

Build tools that make future me smile.

---

## Status

🌌 Age I

The Big Bang
