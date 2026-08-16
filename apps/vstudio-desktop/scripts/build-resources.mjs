#!/usr/bin/env node
// Copies studios/vstudio's standalone Next.js build output into
// apps/vstudio-desktop/resources/vstudio (gitignored), ready for electron-builder to pick up via
// electron-builder.yml's extraResources entry. Trimmed from apps/desktop's own build-resources.mjs
// (which does the same for several studios) down to just what VStudio itself needs — no
// better-sqlite3 rebuild step (VStudio has no such dependency), no gamedev static-site copy.
//
// Requires studios/vstudio to have already been built:
//   pnpm --filter vstudio build   (requires next.config.ts's output: "standalone")

import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");

// server.js itself does `require('next')`, resolved from server.js's OWN directory — but a plain
// copy of the standalone tree doesn't put a top-level node_modules/next there (deliberately, see
// buildNextStandaloneResources below). On a real pnpm install this entry point would be a symlink
// into the .pnpm store; Windows without Developer Mode can't create real symlinks, and Node's own
// cpSync on such a machine silently dereferences every symlink it copies rather than failing, so
// the whole tree ends up 100% real files, no symlinks anywhere. Fix: physically hoist `next`'s real
// package folder into a proper top-level node_modules/next, WITH its sibling packages (@swc/helpers,
// react, react-dom, etc.) copied into next's OWN nested node_modules/, so the exact same
// directory-walk resolution next expects keeps working from its new location.
//
// RECURSIVE: a sibling can have its OWN dependency living in ITS OWN .pnpm/<pkg>@.../node_modules/
// folder rather than as a direct sibling of the original package — so every sibling copied in also
// gets ITS OWN siblings hoisted into its own nested node_modules, recursively.
//
// `visited` is keyed by package name only (not name+version) — this dependency tree is small with
// no real diamond deps in practice.
function hoistPnpmPackage(outDir, pkgName, pnpmRoot = path.join(outDir, "node_modules", ".pnpm")) {
  const storeKey = pkgName.startsWith("@") ? pkgName.replace("/", "+") : pkgName;
  const versionDir = readdirSync(pnpmRoot).find((d) => d.startsWith(`${storeKey}@`));
  if (!versionDir) {
    throw new Error(`Could not find ${pkgName} under ${pnpmRoot} to hoist — inspect the copied output directly.`);
  }
  const siblingsDir = path.join(pnpmRoot, versionDir, "node_modules");
  hoistPnpmPackageRecursive(path.join(outDir, "node_modules"), pkgName, siblingsDir, pnpmRoot, new Set());
}

/** `copyFromDir` is where THIS specific package's content actually lives right now (its parent's
 *  own resolved siblings folder) — always copied from there, unconditionally. `pnpmRoot` is only
 *  used afterward to look for FURTHER siblings this package itself might need; finding none there
 *  is a completely normal, expected outcome (e.g. `@swc`/`@next` are plain vendored folders inside
 *  next's own .pnpm entry, not independently pnpm-resolvable packages). */
function hoistPnpmPackageRecursive(intoNodeModulesDir, pkgName, copyFromDir, pnpmRoot, visited) {
  if (visited.has(pkgName)) return;
  visited.add(pkgName);
  const srcDir = path.join(copyFromDir, pkgName);
  if (!existsSync(srcDir)) return;
  const destDir = path.join(intoNodeModulesDir, pkgName);
  cpSync(srcDir, destDir, { recursive: true, dereference: true });

  const storeKey = pkgName.startsWith("@") ? pkgName.replace("/", "+") : pkgName;
  const versionDir = existsSync(pnpmRoot) ? readdirSync(pnpmRoot).find((d) => d.startsWith(`${storeKey}@`)) : undefined;
  if (!versionDir) return;
  const ownSiblingsDir = path.join(pnpmRoot, versionDir, "node_modules");
  if (!existsSync(ownSiblingsDir)) return;
  const destNodeModules = path.join(destDir, "node_modules");
  for (const sibling of readdirSync(ownSiblingsDir)) {
    if (sibling === pkgName) continue;
    mkdirSync(destNodeModules, { recursive: true });
    hoistPnpmPackageRecursive(destNodeModules, sibling, ownSiblingsDir, pnpmRoot, visited);
  }
}

function packageExistsInPnpmStore(pnpmRoot, pkgName) {
  return existsSync(pnpmRoot) && readdirSync(pnpmRoot).some((d) => d.startsWith(`${pkgName}@`));
}

// The ONE real portability gap: pnpm's tracer leaves some symlinks (react, react-dom, sharp,
// postcss, styled-jsx, caniuse-lite, baseline-browser-mapping, ...) pointing to ABSOLUTE paths on
// THIS dev machine, which won't exist on an end user's machine. Only symlinks whose target resolves
// OUTSIDE outDir are the problem — walk the tree, and for each one found, replace it with a real
// dereferenced copy of its target IN PLACE, leaving every internal-to-outDir symlink (the ones
// pnpm's own resolution scheme actually needs) untouched. Runs in a loop since internalizing one
// external symlink can reveal further external symlinks nested inside it.
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

/** Copies VStudio's standalone build output into apps/vstudio-desktop/resources/vstudio, producing
 *  a fully self-contained, portable copy (no symlinks pointing outside it, no `next`
 *  MODULE_NOT_FOUND shadowing bug — see the two functions above for why each step exists). */
function buildNextStandaloneResources() {
  const appRoot = path.join(repoRoot, "studios", "vstudio");
  const standaloneDir = path.join(appRoot, ".next", "standalone");
  const staticDir = path.join(appRoot, ".next", "static");
  const publicDir = path.join(appRoot, "public");
  const outDir = path.join(desktopRoot, "resources", "vstudio");

  if (!existsSync(standaloneDir)) {
    console.error(
      `No standalone build found at:\n  ${standaloneDir}\n\nRun "pnpm --filter vstudio build" first ` +
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
  // relative path — server.js lands at .next/standalone/studios/vstudio/server.js, with a shared
  // node_modules at .next/standalone/node_modules (root) alongside it.
  const nested = path.join(outDir, "studios", "vstudio");
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
      `${remaining.length} symlink(s) still point outside the packaged output — the app would break ` +
        `on another machine. First few:\n` + remaining.slice(0, 5).map(([p, t]) => `  ${p} -> ${t}`).join("\n")
    );
    process.exit(1);
  }

  // Next's standalone tracer doesn't bundle .env* files by default — checked explicitly rather
  // than assumed, so a stray dev-machine secret can never end up inside a distributable installer.
  const stray = readdirSync(outDir).filter((f) => f.startsWith(".env"));
  if (stray.length > 0) {
    console.error(`Refusing to package: found ${stray.join(", ")} in the standalone output — this must never ship.`);
    process.exit(1);
  }

  ensureFfmpegBinaries(outDir);
  ensureFontAssets(outDir);

  console.log(`Done — resources/vstudio ready (internalized ${fixedCount} external symlink(s)).`);
}

/** VStudio shells out to ffmpeg/ffprobe for import, thumbnails, and export.
 *
 *  Both packages are deliberately marked external in next.config.ts — they resolve their binary by
 *  path relative to their own package directory, which bundling breaks — and that same externality
 *  means Next's standalone tracer may not copy them at all, so this hoists from the repo's real
 *  install when the trace missed it.
 *
 *  The binary itself is then verified to actually be on disk. ffmpeg-static downloads it in a
 *  postinstall step, so a package directory can exist with no executable inside it. Failing loudly
 *  here beats shipping an installer whose export button dies at runtime. */
function ensureFfmpegBinaries(outDir) {
  const repoRootPnpm = path.join(repoRoot, "node_modules", ".pnpm");

  for (const pkg of ["ffmpeg-static", "ffprobe-static"]) {
    const entry = path.join(outDir, "node_modules", pkg);
    if (!existsSync(entry)) {
      if (!packageExistsInPnpmStore(repoRootPnpm, pkg)) {
        console.error(`${pkg} not found anywhere — neither in vstudio's trace nor the repo root. Run "pnpm install" first.`);
        process.exit(1);
      }
      console.log(`${pkg} missing from vstudio's standalone trace — hoisting it from the repo root's real install.`);
      hoistPnpmPackage(outDir, pkg, repoRootPnpm);
    }
  }

  const isWindows = process.platform === "win32";
  const ffmpegBinary = path.join(outDir, "node_modules", "ffmpeg-static", isWindows ? "ffmpeg.exe" : "ffmpeg");
  const ffprobeDir = path.join(outDir, "node_modules", "ffprobe-static", "bin", process.platform, process.arch);
  const ffprobeBinary = path.join(ffprobeDir, isWindows ? "ffprobe.exe" : "ffprobe");

  for (const binary of [ffmpegBinary, ffprobeBinary]) {
    if (!existsSync(binary)) {
      console.error(
        `Refusing to package: ${path.basename(binary)} is missing at\n  ${binary}\n\n` +
          `The package installed but its binary was never downloaded. Run "pnpm rebuild ffmpeg-static" ` +
          `(and check pnpm-workspace.yaml's allowBuilds allows it), then rebuild.`
      );
      process.exit(1);
    }
    // Copying through cpSync can drop the executable bit on POSIX; on Windows it's a no-op.
    if (!isWindows) chmodSync(binary, 0o755);
  }

  console.log("Done — vstudio has runnable ffmpeg + ffprobe binaries.");
}

/** VStudio's drawtext export (and its browser preview, via /api/vstudio/fonts) both read the bundled
 *  Lato/Battambang/Moul font files off disk by real path — see ffmpeg.ts's `resolveFontsDir` comment
 *  for why that can't be `require.resolve`'d out of `@veasna/vstudio` once it's bundled (it's in
 *  this app's own `transpilePackages`, so the package's own source directory doesn't exist in the
 *  packaged output at all). Copied in as a sibling of `server.js` under a fixed name so
 *  `resolveFontsDir`'s `process.cwd()`-relative check finds it without needing to know this
 *  script's own layout. */
function ensureFontAssets(outDir) {
  const srcDir = path.join(repoRoot, "packages", "vstudio", "assets", "fonts");
  if (!existsSync(srcDir)) {
    console.error(`Refusing to package: font assets not found at\n  ${srcDir}`);
    process.exit(1);
  }
  const destDir = path.join(outDir, "vstudio-fonts");
  rmSync(destDir, { recursive: true, force: true });
  cpSync(srcDir, destDir, { recursive: true });
  console.log("Done — vstudio has bundled fonts.");
}

buildNextStandaloneResources();
console.log("Resources ready for electron-builder.");
