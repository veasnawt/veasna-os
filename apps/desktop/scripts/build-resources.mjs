#!/usr/bin/env node
// Copies studios/universe's AND studios/bp's standalone Next.js build output into
// apps/desktop/resources/{universe,bp} (gitignored), plus studios/gamedev's static Vite build into
// apps/desktop/resources/gamedev, rebuilding native addons (better-sqlite3) for Electron's own Node
// ABI where actually needed. Ready for electron-builder to pick up via `extraResources` entries in
// electron-builder.yml.
//
// Requires (all three) to have already been built:
//   pnpm --filter universe build   (requires next.config.ts's output: "standalone")
//   pnpm --filter bp build         (requires next.config.ts's output: "standalone")
//   pnpm --filter loom-engine build

import { cpSync, existsSync, mkdirSync, rmSync, lstatSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");

// server.js itself does `require('next')`, resolved from server.js's OWN directory — but a plain
// copy of the standalone tree doesn't put a top-level node_modules/next there (deliberately, see
// buildNextStandaloneResources below). On a real pnpm install this entry point would be a symlink
// into the .pnpm store; Windows without Developer Mode can't create real symlinks, and — confirmed
// empirically — Node's own cpSync on such a machine silently dereferences every symlink it copies
// rather than failing, so the whole tree ends up 100% real files, no symlinks anywhere (on a
// machine WITH Developer Mode, cpSync preserves real symlinks instead — internalizeExternalSymlinks
// below handles both cases). Fix: physically hoist `next`'s real package folder into a proper
// top-level node_modules/next, WITH its sibling packages (@swc/helpers, react, react-dom, etc. —
// everything next's own code resolves via directory-walk from inside its own .pnpm/next@.../
// node_modules/ home) copied into next's OWN nested node_modules/, so the exact same directory-walk
// resolution next expects keeps working from its new location — no symlinks or junctions needed.
// `pnpmRoot` defaults to the copied output's OWN .pnpm store, but can be overridden — needed for
// better-sqlite3 in bp's build, which Next's standalone tracer doesn't capture AT ALL (confirmed:
// grepped the real standalone output, no trace of it anywhere) despite bp's /api/agent route
// genuinely `require`-ing it transitively through @veasna/ai at runtime — likely because the
// webpack `config.externals` entry bp's next.config.ts adds for it (needed so its native binary
// lookup isn't broken by bundling) makes it invisible to NFT's static analysis, which walks the
// COMPILED bundle's own require() calls to decide what's reachable. Falls back to the real
// monorepo root's own node_modules/.pnpm store in that case — the package is definitely installed
// there (it's a real, resolved dependency), just never made it into bp's own traced copy.
function hoistPnpmPackage(outDir, pkgName, pnpmRoot = path.join(outDir, "node_modules", ".pnpm")) {
  const versionDir = readdirSync(pnpmRoot).find((d) => d.startsWith(`${pkgName}@`));
  if (!versionDir) {
    throw new Error(`Could not find ${pkgName} under ${pnpmRoot} to hoist — inspect the copied output directly.`);
  }
  const siblingsDir = path.join(pnpmRoot, versionDir, "node_modules");
  const pkgSrcDir = path.join(siblingsDir, pkgName);
  const destDir = path.join(outDir, "node_modules", pkgName);
  cpSync(pkgSrcDir, destDir, { recursive: true, dereference: true });
  const destNodeModules = path.join(destDir, "node_modules");
  mkdirSync(destNodeModules, { recursive: true });
  for (const sibling of readdirSync(siblingsDir)) {
    if (sibling === pkgName) continue;
    cpSync(path.join(siblingsDir, sibling), path.join(destNodeModules, sibling), { recursive: true, dereference: true });
  }
}

function packageExistsInPnpmStore(pnpmRoot, pkgName) {
  return existsSync(pnpmRoot) && readdirSync(pnpmRoot).some((d) => d.startsWith(`${pkgName}@`));
}

// The ONE real portability gap: pnpm's tracer leaves some symlinks (confirmed: react, react-dom,
// sharp, postcss, styled-jsx, caniuse-lite, baseline-browser-mapping, and — for bp specifically —
// @veasna/ai, which is itself a symlink to an entirely different repo outside veasna-os) pointing
// to ABSOLUTE paths on THIS dev machine, which won't exist on an end user's machine. Only symlinks
// whose target resolves OUTSIDE outDir are the problem — walk the tree, and for each one found,
// replace it with a real dereferenced copy of its target IN PLACE, leaving every internal-to-outDir
// symlink (the ones pnpm's own resolution scheme actually needs) untouched. Runs in a loop since
// internalizing one external symlink can reveal further external symlinks nested inside it.
function internalizeExternalSymlinks(outDir) {
  let fixedAny = true;
  let totalFixed = 0;
  while (fixedAny) {
    fixedAny = false;
    const toFix = [];
    (function walk(d) {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isSymbolicLink()) {
          const real = realpathSync(full);
          const rel = path.relative(outDir, real);
          if (rel.startsWith("..") || path.isAbsolute(rel)) toFix.push(full);
        } else if (entry.isDirectory()) {
          walk(full);
        }
      }
    })(outDir);
    for (const link of toFix) {
      const target = realpathSync(link);
      rmSync(link, { recursive: true, force: true });
      cpSync(target, link, { recursive: true, dereference: true });
      fixedAny = true;
      totalFixed++;
    }
  }
  return totalFixed;
}

function findExternalSymlinks(outDir, dir = outDir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const rel = path.relative(outDir, realpathSync(full));
      if (rel.startsWith("..") || path.isAbsolute(rel)) found.push([full, readlinkSync(full)]);
    } else if (entry.isDirectory()) {
      findExternalSymlinks(outDir, full, found);
    }
  }
  return found;
}

/** Copies one Next.js app's standalone build output into apps/desktop/resources/<outName>,
 *  producing a fully self-contained, portable copy (no symlinks pointing outside it, no `next`
 *  MODULE_NOT_FOUND shadowing bug — see the two functions above for why each step exists). */
function buildNextStandaloneResources({ appDirName, outName, rebuildBetterSqlite3 }) {
  const appRoot = path.join(repoRoot, "studios", appDirName);
  const standaloneDir = path.join(appRoot, ".next", "standalone");
  const staticDir = path.join(appRoot, ".next", "static");
  const publicDir = path.join(appRoot, "public");
  const outDir = path.join(desktopRoot, "resources", outName);

  if (!existsSync(standaloneDir)) {
    console.error(
      `No standalone build found at:\n  ${standaloneDir}\n\nRun "pnpm --filter ${appDirName} build" first ` +
        `(requires next.config.ts's output: "standalone").`
    );
    process.exit(1);
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  // Plain symlink-preserving copy — critical to NOT dereference here. pnpm's own internal linking
  // scheme depends on symlinks that stay WITHIN this same copied tree. See hoistPnpmPackage's
  // comment for the full story of why a naive dereferenced copy breaks `next`'s own module
  // resolution.
  cpSync(standaloneDir, outDir, { recursive: true });

  // In a pnpm-workspace monorepo, `next build`'s standalone tracer mirrors the workspace's
  // relative path — server.js lands at .next/standalone/studios/<app>/server.js, with a shared
  // node_modules at .next/standalone/node_modules (root) alongside it.
  const nested = path.join(outDir, "studios", appDirName);
  if (existsSync(path.join(nested, "server.js")) && !existsSync(path.join(outDir, "server.js"))) {
    // Deliberately NOT a blanket copy of the whole nested folder — its own node_modules/ contains
    // just a single "next" symlink pointing at the same shared root .pnpm store already fully
    // copied above (WITH next's sibling packages intact). Copying it wholesale recreates a bare
    // top-level node_modules/next with no siblings, which SHADOWS the correct nested one and
    // breaks `require("@swc/helpers/...")` from inside next's own code with MODULE_NOT_FOUND.
    cpSync(path.join(nested, "server.js"), path.join(outDir, "server.js"));
    if (existsSync(path.join(nested, "package.json"))) {
      cpSync(path.join(nested, "package.json"), path.join(outDir, "package.json"));
    }
    // The nested folder's OWN .next/ (BUILD_ID, routes/prerender manifests, server/ — the actual
    // server-side build artifacts server.js reads at startup) is NOT the same thing as the
    // static-assets .next/static copied in below — both are required.
    if (existsSync(path.join(nested, ".next"))) {
      cpSync(path.join(nested, ".next"), path.join(outDir, ".next"), { recursive: true });
    }
    rmSync(path.join(outDir, "studios"), { recursive: true, force: true });
  }

  if (!existsSync(path.join(outDir, "server.js"))) {
    console.error(
      `Copied the standalone build but couldn't find server.js at:\n  ${path.join(outDir, "server.js")}\n\n` +
        `Inspect ${standaloneDir} directly to see the actual shape next build produced and adjust this script.`
    );
    process.exit(1);
  }

  hoistPnpmPackage(outDir, "next");

  // Standalone output intentionally omits static assets and public/ — Next's own documented
  // deployment step is to copy both in manually alongside server.js.
  mkdirSync(path.join(outDir, ".next"), { recursive: true });
  cpSync(staticDir, path.join(outDir, ".next", "static"), { recursive: true });
  if (existsSync(publicDir)) {
    cpSync(publicDir, path.join(outDir, "public"), { recursive: true });
  }

  const fixedCount = internalizeExternalSymlinks(outDir);
  const remaining = findExternalSymlinks(outDir);
  if (remaining.length > 0) {
    console.error(
      `${remaining.length} symlink(s) in ${outName} still point outside the packaged output — the app would ` +
        `break on another machine. First few:\n` + remaining.slice(0, 5).map(([p, t]) => `  ${p} -> ${t}`).join("\n")
    );
    process.exit(1);
  }

  // Next's standalone tracer doesn't bundle .env* files by default (you're expected to supply real
  // env vars via the deployment environment) — but this is checked explicitly rather than assumed,
  // because studios/bp's own .env.local holds a LIVE Anthropic API key. Shipping it inside a
  // distributable installer would leak the developer's real secret to anyone who runs the app.
  // Real env values are injected at fork time by apps/desktop's own server-spawn code instead (see
  // spawnBpServer.ts) — never copied from the dev machine's own env files.
  const stray = readdirSync(outDir).filter((f) => f.startsWith(".env"));
  if (stray.length > 0) {
    console.error(`Refusing to package ${outName}: found ${stray.join(", ")} in the standalone output — this must never ship.`);
    process.exit(1);
  }

  const sqliteEntry = path.join(outDir, "node_modules", "better-sqlite3");
  if (rebuildBetterSqlite3) {
    if (!existsSync(sqliteEntry)) {
      // Next's standalone tracer didn't capture it (see hoistPnpmPackage's comment for why, in
      // bp's case) — it's still a real, resolved dependency in the actual monorepo install, just
      // never traced into this app's OWN copy. Hoist it from there instead.
      const repoRootPnpm = path.join(repoRoot, "node_modules", ".pnpm");
      if (!packageExistsInPnpmStore(repoRootPnpm, "better-sqlite3")) {
        console.error(`better-sqlite3 not found anywhere — neither in ${outName}'s own trace nor the repo root's node_modules. Run "pnpm install" first.`);
        process.exit(1);
      }
      console.log(`better-sqlite3 missing from ${outName}'s own standalone trace — hoisting it from the repo root's real install instead.`);
      hoistPnpmPackage(outDir, "better-sqlite3", repoRootPnpm);
    }
    console.log(`Rebuilding better-sqlite3 for Electron's Node ABI (${outName})...`);
    execSync(`pnpm exec electron-rebuild --module-dir "${outDir}" --only better-sqlite3`, { cwd: desktopRoot, stdio: "inherit" });
  } else if (existsSync(sqliteEntry)) {
    // Present but genuinely unused by this particular app's own runtime code paths (confirmed for
    // universe: Next's tracer only includes it because @veasna/ai lists it as a dependency, not
    // because anything universe actually imports reaches it) — guarded no-op rather than a hard
    // failure, in case that ever changes.
    console.log(`better-sqlite3 present in ${outName} but not marked as needed — skipping the Electron ABI rebuild.`);
  }

  console.log(`Done — resources/${outName} ready (internalized ${fixedCount} external symlink(s)).`);
}

/** Game Dev Studio (Vite/"loom-engine") builds to a fully static, self-contained dist/ folder —
 *  no server process, no node_modules, no native modules, nothing to hoist or dereference. Just
 *  copy it straight over. */
function buildGamedevStatic() {
  const distDir = path.join(repoRoot, "studios", "gamedev", "dist");
  const outDir = path.join(desktopRoot, "resources", "gamedev");
  if (!existsSync(distDir)) {
    console.error(`No build found at:\n  ${distDir}\n\nRun "pnpm --filter loom-engine build" first.`);
    process.exit(1);
  }
  rmSync(outDir, { recursive: true, force: true });
  cpSync(distDir, outDir, { recursive: true });
  console.log(`Done — resources/gamedev ready.`);
}

buildNextStandaloneResources({ appDirName: "universe", outName: "universe", rebuildBetterSqlite3: false });
buildNextStandaloneResources({ appDirName: "bp", outName: "bp", rebuildBetterSqlite3: true });
buildGamedevStatic();

console.log("All resources ready for electron-builder.");
