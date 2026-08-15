# `@veasna/universe`

The Veasna OS shell UI — everything under the "Universe" studio: the 3D cosmos, the traditional
desktop (windows, taskbar, Start menu, file manager, terminal, browser, settings), and Rixie's chat
window. Consumed by [`studios/universe`](../../studios/universe), the same `packages/*` →
`studios/*` split every other studio in this repo follows (see the root
[README's Monorepo Layout](../../README.md#monorepo-layout)).

## Shape

- `VeasnaShell.tsx` — the top-level shell: mode switching (3D ↔ desktop), window management,
  taskbar, open-app state.
- `CosmosCanvas.tsx` — the 3D mode's own scene (`@react-three/fiber`), rendering each studio as an
  orbiting celestial body.
- `components/TraditionalShell.tsx` — the desktop mode: icon grid, taskbar, Start menu, and the
  `STUDIO_ICONS` map (which icon represents which studio).
- `components/StudioFrame.tsx` — renders any studio's `launchUrl` as a window (an `<iframe>` in a
  browser tab / `pnpm dev`, a real Electron `<webview>` in the packaged desktop app).
- `constants.ts` — `CELESTIAL_BODIES`, the actual list of studios (name, description, orbit/visual
  properties for 3D mode, and an optional `launchUrl` — see below).
- `utils/runtime.ts` — resolves a studio's real URL at runtime: the hardcoded dev-mode port in
  packages/universe's browser tab / `pnpm dev`, exactly as before. Rebuild once, both modes work.

## Adding a new launchable studio

A studio becomes launchable from Universe (desktop icon + 3D cosmos body + taskbar) with four edits,
no new dispatch logic required — `Window.tsx`/`StudioFrame.tsx` both key off any `CelestialBody` with
a `launchUrl` set:

1. Add its id to the `StudioId` union in `types.ts`.
2. Add a `CelestialBody` entry to `CELESTIAL_BODIES` in `constants.ts`, including `launchUrl` (its
   dev-mode port, e.g. `"http://localhost:3002"`).
3. Add an icon for it to `STUDIO_ICONS` in `TraditionalShell.tsx` (a `@veasnawt/vicons` icon, or a
   standalone component like `TerminalIcon.tsx` if nothing in vicons fits yet).
4. Add its dev port to `DEV_PORT_TO_STUDIO_KEY` in `utils/runtime.ts`, so the PACKAGED desktop app
   can substitute the studio's real, dynamically-assigned port at runtime (via the
   `window.veasnaStudios` IPC bridge — see `apps/desktop/src/main.ts`'s `studioUrls`).

VStudio was added this way — see its entry in `constants.ts` for a worked example.

## Icons

Every icon in this package should come from [`@veasnawt/vicons`](../vicons) when a match exists.
`packages/vicons/MISSING_ICONS.md` tracks the (shrinking) set of concepts that still fall back to a
hand-rolled inline SVG or a `lucide-react` import, and which consumer each fallback lives in.
