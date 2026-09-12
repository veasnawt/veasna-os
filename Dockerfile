# vcut.io hosted web deploy — builds and runs studios/vcut with VCUT_HOSTED=true.
#
# Base image: ghcr.io/puppeteer/puppeteer, not a bare node:*-slim/alpine. It's a Debian image
# carrying every system library headless Chromium needs at runtime (libnss3, libatk, libcups2, ...)
# — a bare Node image is a confirmed-bad pairing for Puppeteer (missing libs -> Chromium fails to
# launch at all). It does NOT bundle its own puppeteer/Chromium install; `pnpm install` below still
# runs puppeteer's own postinstall to download Chromium into $PUPPETEER_CACHE_DIR, exactly like
# local dev and the desktop build already do — this image only supplies the OS-level libraries that
# download needs to actually run once launched.
#
# Pinned to 25.9.0 to match the exact `puppeteer` version pnpm-lock.yaml resolves to (see
# studios/vcut/package.json) — the tag doesn't have to match (any recent Debian base with the right
# libs works), but pinning both together means "the image that shipped when this was built" instead
# of drifting on every `docker build`.
FROM ghcr.io/puppeteer/puppeteer:25.9.0 AS base

# The upstream image ends on `USER pptruser` (non-root, for Chromium's OS-level sandbox). VCut's
# render harness already launches Chromium with --no-sandbox (see khmerTextHarness.ts's own comment
# on why: this browser only ever navigates to the app's own local page, never third-party content),
# which is the whole reason that non-root separation existed — so running the app itself as root
# here trades nothing away, and sidesteps having to chown a Fly.io-mounted volume to a non-root uid
# just to let the export pipeline write project files to it.
USER root

# Pinned explicitly rather than trusting whatever the base image defaults root's HOME to — this
# value is referenced by path later (Puppeteer's own Chromium download cache), and builder/runner
# are separate stages/layers that must agree on it byte-for-byte for that COPY to find anything.
ENV HOME=/root

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate

FROM base AS builder
WORKDIR /repo

# One wholesale copy rather than a package.json-only layer first: pnpm's workspace install needs
# every workspace package's package.json to resolve against the lockfile (packages/*, studios/*,
# apps/* per pnpm-workspace.yaml), and Docker's COPY can't glob multiple package.json files into
# their respective subdirectories in one instruction without flattening them. .dockerignore already
# strips node_modules, build output, and the native mobile/desktop projects this image never needs,
# so the context this actually copies is source-sized, not "the whole monorepo including its
# artifacts." Trade-off: any source change invalidates the install layer too, not just the build
# layer — fine for now, worth revisiting only if CI build time becomes a real problem.
COPY . .

# NEXT_PUBLIC_* values are inlined into the client/static bundle at BUILD time, not read at
# container start — confirmed by a real `next build`, which prerenders `/` as static output gated
# on this exact flag (studios/vcut/app/page.tsx). Setting VCUT_HOSTED/NEXT_PUBLIC_VCUT_HOSTED only
# in fly.toml's runtime env would ship a build that still thinks it's the desktop/local build.
#
# NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY are the same story: `getSupabaseBrowserClient`
# (packages/auth/src/browser.ts) reads them via `process.env` directly, which webpack inlines at
# build time same as any other NEXT_PUBLIC_ var — NOT read at container start either. Left unset
# here, the build "succeeds" but sign-in silently no-ops for every visitor (that function's own
# documented behavior for "Supabase isn't configured": return null, never throw) — a build-time gap
# with no error to catch it, so these must be passed as `--build-arg` at `docker build`/`fly deploy`
# time, not left to fly.toml's [env] (which only affects the already-built container's runtime).
# The service-role key has no such requirement — server.ts reads it with no NEXT_PUBLIC_ prefix, so
# it's a plain runtime secret (fly.toml's [env] / `fly secrets`), never baked into a build layer.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV VCUT_HOSTED=true
ENV NEXT_PUBLIC_VCUT_HOSTED=true

RUN pnpm install --frozen-lockfile
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" || (echo "NEXT_PUBLIC_SUPABASE_URL build-arg is required — sign-in would silently no-op without it" && exit 1)
RUN test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" || (echo "NEXT_PUBLIC_SUPABASE_ANON_KEY build-arg is required — sign-in would silently no-op without it" && exit 1)
RUN pnpm --filter vcut... build
# studios/vcut has no public/ directory at all — confirmed directly, not assumed (icons are served
# via the App Router's file-based /icon.png convention instead, no public/ needed). Next's own docs
# treat public/ as optional, and apps/vcut-desktop/scripts/build-resources.mjs already guards this
# same copy with an existsSync check for exactly that reason. Docker's COPY has no such conditional,
# so an always-empty directory is created here instead — copying it below is then a harmless no-op
# today, and this keeps working automatically if a public/ directory is ever actually added later.
RUN mkdir -p /repo/studios/vcut/public

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV VCUT_HOSTED=true
ENV NEXT_PUBLIC_VCUT_HOSTED=true
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# .next/standalone mirrors the workspace's relative path: server.js lands at
# .next/standalone/studios/vcut/server.js, with a shared node_modules at .next/standalone/node_modules
# (root) alongside it — apps/vcut-desktop/scripts/build-resources.mjs documents this same shape for
# the desktop build. That script then PROMOTES server.js up to its own outDir root (flattening one
# level) because the desktop packager wants a flat resources/vcut/ folder — but doing the same thing
# here broke module resolution outright: server.js's own nested node_modules
# (.next/standalone/studios/vcut/node_modules) holds `next`/`puppeteer`/`ffmpeg-static`/
# `ffprobe-static` as RELATIVE symlinks (`../../../node_modules/.pnpm/...`), correct ONLY at their
# original nesting depth. Flattening moved server.js one level shallower without adjusting those
# symlinks, so they ended up pointing above the copied tree entirely — confirmed directly across two
# separate crash loops (`Cannot find module 'next'`, then `Cannot find module
# '@swc/helpers/_/_interop_require_default'` after a first attempt at patching just `next` itself
# back in) before landing on the actual fix: DON'T flatten. Copy the whole standalone tree AS-IS,
# nesting preserved, so every one of those relative symlinks still resolves exactly like it did
# inside the builder stage.
COPY --from=builder /repo/studios/vcut/.next/standalone ./
COPY --from=builder /repo/studios/vcut/.next/static ./studios/vcut/.next/static
COPY --from=builder /repo/studios/vcut/public ./studios/vcut/public

# Standalone's tracer IS missing ffmpeg-static/ffprobe-static's actual platform binaries — confirmed
# directly (not just the theoretical risk this comment used to only guess at) by the verification RUN
# below actually failing on a real `fly deploy` before this COPY existed. Both are marked external in
# next.config.ts precisely because they resolve their binary by a path relative to their own package
# directory — bundling breaks that resolution, and it turns out Next's tracer doesn't reliably follow
# that runtime path.join() far enough to know the binary matters. Fixed by copying the package
# directly from the BUILDER's full (untraced) install into the SAME nested location the other three
# external packages' symlinks already correctly live — pnpm always symlinks a direct dependency into
# its declaring package's own node_modules regardless of hoisting config, so this path is reliable
# independent of whatever the standalone trace did or didn't include; keeping it at this same nested
# depth (not the flattened root) is what makes it consistent with everything above.
COPY --from=builder /repo/studios/vcut/node_modules/ffmpeg-static ./studios/vcut/node_modules/ffmpeg-static
COPY --from=builder /repo/studios/vcut/node_modules/ffprobe-static ./studios/vcut/node_modules/ffprobe-static
# @fluidinference/fluidvad (Auto Captions' real voice-activity detection) reads its embedded .wasm
# model off disk relative to its own package directory — same class of "resolves a real file next to
# itself" problem as ffmpeg-static/ffprobe-static above, marked external in next.config.ts for the
# same reason, fixed the same way here.
COPY --from=builder /repo/studios/vcut/node_modules/@fluidinference/fluidvad ./studios/vcut/node_modules/@fluidinference/fluidvad

# Verified present and executable here rather than trusted, matching ensureFfmpegBinaries' same
# reasoning in the desktop build script — better to fail the image build loudly than ship an export
# button that 500s.
# ffprobe-static only ships prebuilt linux/x64 and linux/ia32 binaries (no linux/arm64 at all) —
# hardcoded rather than derived from the build machine's own arch, since that's a real hard
# constraint on what this image can run on: an arm64 Fly.io machine would build "successfully" and
# then fail this exact check. Fly.io's default machine family is x86_64, so this only matters if
# that's ever changed deliberately.
RUN test -f studios/vcut/node_modules/ffmpeg-static/ffmpeg || \
      (echo "ffmpeg-static binary missing from standalone trace — cannot ship" && exit 1)
RUN test -f studios/vcut/node_modules/ffprobe-static/bin/linux/x64/ffprobe || \
      (echo "ffprobe-static binary missing from standalone trace — cannot ship (also check this isn't an arm64 build; see comment above)" && exit 1)
RUN test -f studios/vcut/node_modules/@fluidinference/fluidvad/dist/fluidvad_bg.wasm || \
      (echo "fluidvad wasm missing from standalone trace — cannot ship" && exit 1)
RUN chmod +x studios/vcut/node_modules/ffmpeg-static/ffmpeg studios/vcut/node_modules/ffprobe-static/bin/linux/x64/ffprobe

# `ffmpeg-static`'s bundled Linux binary (johnvansickle's static build) is missing the `drawtext`
# filter entirely — confirmed LIVE, not assumed: a real hosted export with a text clip failed with
# "No such filter: 'drawtext'" despite the build config listing `--enable-libfreetype`. This is a
# widely-reported upstream gap (johnvansickle's builds from FFmpeg 6.1 onward need
# `--enable-libharfbuzz` alongside libfreetype for drawtext specifically, and don't have it) — not
# fixable by changing OUR OWN ffmpeg command-line flags.
#
# First fix attempt was Debian bookworm's own `apt-get install ffmpeg` (5.1.3 — old enough to predate
# the harfbuzz requirement entirely). That DID restore `drawtext`, but broke a second, different real
# export the same way: `buildExportPlan.ts`'s `text_align` option (unconditional on every text clip,
# confirmed live against the ORIGINAL ffmpeg-static 7.0.2 binary per that code's own comment) doesn't
# exist yet in ffmpeg 5.1 — `text_align` was added to `drawtext` in a later release. Downgrading far
# enough to dodge the harfbuzz gap landed before a feature this app already depends on unconditionally.
#
# BtbN's FFmpeg-Builds (github.com/BtbN/FFmpeg-Builds) is the fix that's actually both modern AND has
# harfbuzz — the exact reason many projects reportedly switched away from johnvansickle's builds for
# this specific gap. `n8.1` (a real, current stable ffmpeg release, not a bleeding-edge `master`
# snapshot) has both `drawtext` and `text_align` — confirmed live against the deployed binary before
# this comment was written, not assumed from release notes. Downloaded at build time rather than
# vendored into the repo (a ~125MB tarball has no business living in git); `VCUT_FFMPEG_PATH`/
# `VCUT_FFPROBE_PATH` (`_lib/ffmpeg.ts`'s own `envOverride`) point at the extracted binaries. Unset
# for desktop/local dev, which keeps using the bundled `ffmpeg-static`/`ffprobe-static` binaries above
# exactly as before — those were never broken for anyone NOT hitting this Linux-static-build gap.
RUN curl -sL "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz" \
      -o /tmp/ffmpeg-build.tar.xz && \
    mkdir -p /opt/ffmpeg-build && \
    tar -xJf /tmp/ffmpeg-build.tar.xz -C /opt/ffmpeg-build --strip-components=1 && \
    rm /tmp/ffmpeg-build.tar.xz
ENV VCUT_FFMPEG_PATH=/opt/ffmpeg-build/bin/ffmpeg
ENV VCUT_FFPROBE_PATH=/opt/ffmpeg-build/bin/ffprobe

# Puppeteer's own npm package is just JS — the actual Chromium BROWSER binary it launches gets
# downloaded separately, by its postinstall script, into $HOME/.cache/puppeteer during the BUILDER
# stage's `pnpm install`. That cache is specific to the builder's own container layer; the runner
# stage starts fresh from `base` and never sees it unless copied explicitly, which nothing here did
# until now — left unfixed, the app itself boots fine (this isn't what crashed the earlier deploys)
# but every Khmer-text export would fail the moment khmerTextHarness.ts's `puppeteer.launch()` looks
# for a browser that was never copied into the image at all.
COPY --from=builder /root/.cache/puppeteer /root/.cache/puppeteer

# VCut's drawtext export (and its browser preview) reads bundled fonts off disk by real path —
# see ffmpeg.ts's resolveFontsDir comment for why this can't be require.resolve'd once
# @veasnawt/vcut is transpiled into the app bundle. Same fixed-name sibling-of-server.js layout the
# desktop build's ensureFontAssets uses — sibling of server.js now means studios/vcut/, matching the
# unflattened layout above.
COPY --from=builder /repo/packages/vcut/assets/fonts ./studios/vcut/vcut-fonts
# Same story for bundled SFX — see sfx.ts's resolveSfxDir comment, which expects a `vcut-sfx`
# sibling of server.js.
COPY --from=builder /repo/packages/vcut/assets/sfx ./studios/vcut/vcut-sfx
# Same story for the bundled outro images (logo + background) — see outroAssets.ts's
# resolveImagesDir comment, which expects a `vcut-images` sibling of server.js.
COPY --from=builder /repo/packages/vcut/assets/images ./studios/vcut/vcut-images

# VCut's actual storage root (see _lib/paths.ts) isn't its own env var — it's always
# `$VEASNA_WORKSPACE_ROOT/.vcut`, the same convention studios/universe uses, with an unset fallback
# of `process.cwd()/../..` meant for a monorepo checkout. Unset here, that fallback would resolve to
# `/` (server.js's cwd is /app/studios/vcut), which is wrong and dangerous — VEASNA_WORKSPACE_ROOT
# must be set explicitly. fly.toml mounts a persistent volume at /data; the app creates .vcut under
# it itself on first write, but the parent is created ahead of time here so that isn't racing a
# not-yet-attached volume on a cold start.
RUN mkdir -p /data
ENV VEASNA_WORKSPACE_ROOT=/data

WORKDIR /app/studios/vcut
EXPOSE 3000
CMD ["node", "server.js"]
