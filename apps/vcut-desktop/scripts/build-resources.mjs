#!/usr/bin/env node
// Copies studios/vcut's standalone Next.js build output into
// apps/vcut-desktop/resources/vcut (gitignored), ready for electron-builder to pick up via
// electron-builder.yml's extraResources entry. Trimmed from apps/desktop's own build-resources.mjs
// (which does the same for several studios) down to just what VCut itself needs — no
// better-sqlite3 rebuild step (VCut has no such dependency), no gamedev static-site copy.
//
// Requires studios/vcut to have already been built:
//   pnpm --filter vcut build   (requires next.config.ts's output: "standalone")
//
// For the desktop sign-in button (packages/vcut/src/api/desktopAuth.ts, apps/vcut-desktop/src/main.ts)
// to actually work in the packaged app, that `pnpm --filter vcut build` needs
// NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY set in its OWN shell environment first — see
// studios/vcut/.env.example's own comments on these two (safe to expose; NEXT_PUBLIC_-prefixed vars
// are inlined into the bundle at Next's build time, not read at runtime, so setting them only here in
// this script would be too late). VCUT_HOSTED/NEXT_PUBLIC_VCUT_HOSTED must stay UNSET for this build —
// desktop's bundled server is never the hosted deployment, only a signed-in account on top of it.
// Omitting the Supabase vars entirely is also fine: `getSupabaseBrowserClient()` returns `null` and
// the packaged app behaves exactly as it always has, no sign-in button shown.

import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, readdirSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Node's own `cpSync({ recursive: true })` has proven unreliable on this specific machine for
 *  larger/nested recursive directory copies — not just slow, genuinely WRONG: a real run left
 *  `next/node_modules/postcss` as a 0-byte FILE instead of a proper recursive directory copy, with
 *  no error thrown, silently corrupting the hoisted output. `robocopy` (Windows' own, battle-tested
 *  bulk-copy tool) does not have this problem — confirmed directly by re-running the same copy with
 *  it. Falls back to `cpSync` on non-Windows platforms (`robocopy` doesn't exist there, and this
 *  script overall only runs on the machine actually packaging the Windows desktop build). Robocopy's
 *  exit codes are a bitmask where 0-7 all mean success (1 = files copied, not an error) and only 8+
 *  is a real failure — `execFileSync` throwing on ANY non-zero code would misreport routine success
 *  as a crash, so failures are detected explicitly instead of relying on that throw.
 *
 *  `stdio: ["ignore", "ignore", "pipe"]` — NOT `"pipe"` for all three — is load-bearing, confirmed
 *  directly after a real run of this exact copy hung indefinitely (4919 files, finished in ~15s when
 *  run directly in a terminal; via `execFileSync` with stdout piped, it copied 7 files in several
 *  minutes and never finished). `execFileSync` fully buffers piped stdout in memory and doesn't start
 *  reading it until the CHILD PROCESS EXITS — robocopy's own directory/file-progress output fills the
 *  OS pipe buffer faster than nothing-is-reading-it can drain, and robocopy blocks writing to a full
 *  pipe, deadlocking the whole copy. Discarding stdout entirely (never needed — success/failure is
 *  read from the exit code) sidesteps this; stderr stays piped since that's what actually gets
 *  surfaced in the thrown Error below. */
function copyRecursiveDereferenced(src, dest) {
  if (process.platform !== "win32") {
    cpSync(src, dest, { recursive: true, dereference: true });
    return;
  }
  mkdirSync(dest, { recursive: true });
  try {
    execFileSync("robocopy", [src, dest, "/E", "/COPY:DAT", "/NFL", "/NDL", "/NJH"], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (err) {
    const code = err.status ?? 0;
    if (code >= 8) {
      throw new Error(`robocopy failed copying ${src} -> ${dest} (exit ${code}): ${err.stderr?.toString() ?? err.message}`);
    }
  }
}

/** robocopy's own symlink dereferencing (used above, no `/SL`) turns out to be unreliable for a
 *  specific pattern real pnpm stores actually produce: a RELATIVE directory symlink (e.g.
 *  `next@.../node_modules/postcss -> ../../postcss@8.4.31/node_modules/postcss`). After a full-tree
 *  robocopy the corresponding destination path is consistently a 0-byte FILE instead of that
 *  directory's content, with robocopy itself reporting zero failures for the run that produced it.
 *
 *  Root cause, confirmed directly rather than assumed: Windows' own native symlink-FOLLOWING APIs —
 *  which is what `existsSync`/`realpathSync` and (evidently) robocopy's dereferencing all use under
 *  the hood — throw `EPERM` trying to resolve THIS symlink at all, despite it being completely
 *  valid; `readlinkSync` (which just reads the reparse point's stored target STRING, no resolution
 *  attempted) plus a plain `path.resolve` against it gets the identical real path with zero issues.
 *  Whatever native quirk causes the EPERM — a plausible guess is Windows tracking symlinks as
 *  "file" vs. "directory" reparse points internally and choking when that stored flag doesn't
 *  match what's actually at the target, though this wasn't independently confirmed — this
 *  text-only resolution sidesteps it entirely rather than depending on understanding it. Absolute
 *  symlinks and plain files copy correctly through the original robocopy call; this is specific to
 *  relative directory symlinks that trip this particular native resolution path.
 *
 *  Rather than trust robocopy's dereferencing everywhere, this walks the SOURCE tree (not the
 *  already-corrupted destination) for every symlink, and for each one whose destination copy came
 *  out as a suspicious 0-byte file where the real target is NOT actually empty, deletes that stub
 *  and re-copies the real, manually-resolved target directly into the same destination path — a
 *  real-directory-to-real-directory (or real-file-to-real-file) copy, which sidesteps robocopy's
 *  symlink-dereferencing path entirely rather than trying to fix whatever it's doing wrong there. */
function repairBrokenSymlinkCopies(srcRoot, destRoot) {
  const symlinks = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        symlinks.push(full);
      } else if (entry.isDirectory()) {
        walk(full);
      }
    }
  })(srcRoot);

  let repaired = 0;
  for (const link of symlinks) {
    const destPath = path.join(destRoot, path.relative(srcRoot, link));
    if (!existsSync(destPath)) continue;
    const destStat = statSync(destPath);
    if (!destStat.isFile() || destStat.size !== 0) continue; // not the corruption signature

    // Text-only resolution (readlinkSync + path.resolve), deliberately NOT realpathSync/existsSync
    // on the symlink itself — see this function's own doc comment for why those throw EPERM on
    // exactly the symlinks this function exists to repair. Still wrapped in try/catch: a handful of
    // OTHER symlinks in a real pnpm store (seen directly: one inside puppeteer's own downloaded
    // browsers package) are unresolvable for entirely different, never-identified reasons — nothing
    // to repair FROM in that case either way, so skip rather than let one bad symlink abort the
    // whole packaging run over a repair step that's already best-effort by nature.
    let real, realStat;
    try {
      real = path.resolve(path.dirname(link), readlinkSync(link));
      if (!existsSync(real)) continue; // genuinely broken symlink in the source — nothing to repair with
      realStat = statSync(real);
    } catch {
      continue;
    }
    if (realStat.isFile() && realStat.size === 0) continue; // the real target IS legitimately empty

    rmSync(destPath, { recursive: true, force: true });
    if (realStat.isDirectory()) {
      copyRecursiveDereferenced(real, destPath);
    } else {
      cpSync(real, destPath);
    }
    repaired++;
  }
  return repaired;
}

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
  copyRecursiveDereferenced(srcDir, destDir);

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
      copyRecursiveDereferenced(target, link);
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

/** Copies VCut's standalone build output into apps/vcut-desktop/resources/vcut, producing
 *  a fully self-contained, portable copy (no symlinks pointing outside it, no `next`
 *  MODULE_NOT_FOUND shadowing bug — see the two functions above for why each step exists). */
function buildNextStandaloneResources() {
  const appRoot = path.join(repoRoot, "studios", "vcut");
  const standaloneDir = path.join(appRoot, ".next", "standalone");
  const staticDir = path.join(appRoot, ".next", "static");
  const publicDir = path.join(appRoot, "public");
  const outDir = path.join(desktopRoot, "resources", "vcut");

  if (!existsSync(standaloneDir)) {
    console.error(
      `No standalone build found at:\n  ${standaloneDir}\n\nRun "pnpm --filter vcut build" first ` +
        `(requires next.config.ts's output: "standalone").`
    );
    process.exit(1);
  }

  // Dereferencing rather than symlink-preserving on purpose — see copyRecursiveDereferenced's own
  // doc comment. A machine WITH SeCreateSymbolicLinkPrivilege (admin, or Developer Mode on) could
  // use a plain symlink-preserving copy instead (smaller, faster), but dereferencing works
  // correctly either way, just larger on disk — not worth branching on a privilege check for that.
  rmSync(outDir, { recursive: true, force: true });
  copyRecursiveDereferenced(standaloneDir, outDir);
  const repairedCount = repairBrokenSymlinkCopies(standaloneDir, outDir);
  if (repairedCount > 0) {
    console.log(`Repaired ${repairedCount} symlink(s) robocopy dereferenced incorrectly.`);
  }

  // In a pnpm-workspace monorepo, `next build`'s standalone tracer mirrors the workspace's
  // relative path — server.js lands at .next/standalone/studios/vcut/server.js, with a shared
  // node_modules at .next/standalone/node_modules (root) alongside it.
  const nested = path.join(outDir, "studios", "vcut");
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
      copyRecursiveDereferenced(path.join(nested, ".next"), path.join(outDir, ".next"));
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
  copyRecursiveDereferenced(staticDir, path.join(outDir, ".next", "static"));
  if (existsSync(publicDir)) {
    copyRecursiveDereferenced(publicDir, path.join(outDir, "public"));
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
  ensurePuppeteer(outDir);
  ensureFontAssets(outDir);
  ensureSfxAssets(outDir);

  console.log(`Done — resources/vcut ready (internalized ${fixedCount} external symlink(s)).`);
}

/** VCut shells out to ffmpeg/ffprobe for import, thumbnails, and export.
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
        console.error(`${pkg} not found anywhere — neither in vcut's trace nor the repo root. Run "pnpm install" first.`);
        process.exit(1);
      }
      console.log(`${pkg} missing from vcut's standalone trace — hoisting it from the repo root's real install.`);
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

  console.log("Done — vcut has runnable ffmpeg + ffprobe binaries.");
}

/** `_lib/khmerTextHarness.ts` (imported unconditionally at the top of export/route.ts, for Khmer-script
 *  text clip rendering) statically imports `puppeteer` — and unlike ffmpeg-static/ffprobe-static,
 *  nothing marks it external in next.config.ts, so in principle Next's own tracer should bundle it.
 *  Confirmed directly that it DOES: `.next/standalone/studios/vcut/node_modules/puppeteer` is a
 *  correct symlink into the repo's `.pnpm` store right after `next build`. It's this script's OWN
 *  copy step that loses it — `repairBrokenSymlinkCopies` only repairs a symlink whose robocopy'd
 *  destination came out as a 0-byte FILE (the corruption signature seen for other relative symlinks);
 *  for puppeteer specifically, robocopy produces no destination entry at all, so that repair pass's
 *  `if (!existsSync(destPath)) continue` skips right past it, and the resulting package is missing
 *  from the packaged output entirely. Because it's a STATIC top-level import, this isn't a "Khmer
 *  text export fails" bug — it's `Cannot find package 'puppeteer'` crashing the entire route MODULE
 *  at import time, taking every export (and even the plain ffmpeg-availability check) down with it
 *  regardless of whether the export in question uses Khmer text at all. Same hoist-from-repo-root
 *  fallback as `ensureFfmpegBinaries` fixes it the same way.
 *
 *  This does NOT bundle puppeteer's actual Chromium browser binary — that lives outside node_modules
 *  entirely, in the OS user cache dir (`~/.cache/puppeteer` on this machine), so it's absent from any
 *  node_modules-based packaging step by construction and won't exist on an end user's machine either.
 *  `puppeteer.launch()` itself will still fail on a packaged install until that's addressed
 *  separately — this fix's scope is just restoring every OTHER export (the overwhelming majority)
 *  that never needed Khmer text rendering in the first place. */
function ensurePuppeteer(outDir) {
  const repoRootPnpm = path.join(repoRoot, "node_modules", ".pnpm");

  for (const pkg of ["puppeteer", "puppeteer-core"]) {
    const entry = path.join(outDir, "node_modules", pkg);
    if (!existsSync(entry)) {
      if (!packageExistsInPnpmStore(repoRootPnpm, pkg)) {
        console.error(`${pkg} not found anywhere — neither in vcut's trace nor the repo root. Run "pnpm install" first.`);
        process.exit(1);
      }
      console.log(`${pkg} missing from vcut's standalone trace — hoisting it from the repo root's real install.`);
      hoistPnpmPackage(outDir, pkg, repoRootPnpm);
    }
  }

  console.log("Done — vcut's export route can load puppeteer (Khmer-text rendering itself still needs a bundled Chromium — separate follow-up).");
}

/** VCut's drawtext export (and its browser preview, via /api/vcut/fonts) both read the bundled
 *  Lato/Battambang/Moul font files off disk by real path — see ffmpeg.ts's `resolveFontsDir` comment
 *  for why that can't be `require.resolve`'d out of `@veasnawt/vcut` once it's bundled (it's in
 *  this app's own `transpilePackages`, so the package's own source directory doesn't exist in the
 *  packaged output at all). Copied in as a sibling of `server.js` under a fixed name so
 *  `resolveFontsDir`'s `process.cwd()`-relative check finds it without needing to know this
 *  script's own layout. */
function ensureFontAssets(outDir) {
  const srcDir = path.join(repoRoot, "packages", "vcut", "assets", "fonts");
  if (!existsSync(srcDir)) {
    console.error(`Refusing to package: font assets not found at\n  ${srcDir}`);
    process.exit(1);
  }
  const destDir = path.join(outDir, "vcut-fonts");
  rmSync(destDir, { recursive: true, force: true });
  copyRecursiveDereferenced(srcDir, destDir);
  console.log("Done — vcut has bundled fonts.");
}

/** Same packaged-vs-dev split as `ensureFontAssets` above, for the bundled SFX library — see
 *  `studios/vcut/app/api/vcut/_lib/sfx.ts`'s `resolveSfxDir` comment, which already documented this
 *  function's existence here before it was actually written. Without this, a packaged desktop
 *  install has no `vcut-sfx` directory AND no monorepo checkout for its dev fallback to find either,
 *  so every SFX browse/download request 500s in production while working fine in dev. */
function ensureSfxAssets(outDir) {
  const srcDir = path.join(repoRoot, "packages", "vcut", "assets", "sfx");
  if (!existsSync(srcDir)) {
    console.error(`Refusing to package: SFX assets not found at\n  ${srcDir}`);
    process.exit(1);
  }
  const destDir = path.join(outDir, "vcut-sfx");
  rmSync(destDir, { recursive: true, force: true });
  copyRecursiveDereferenced(srcDir, destDir);
  console.log("Done — vcut has bundled SFX.");
}

buildNextStandaloneResources();
console.log("Resources ready for electron-builder.");
