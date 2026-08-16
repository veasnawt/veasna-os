# Building VStudio for iOS on your Mac

The `ios/` platform project (`apps/mobile/ios`) was generated here on Windows via `npx cap add ios`,
but iOS builds require a real Mac with Xcode — this environment can't run or test that half. This is
the handoff checklist to get it building and running there.

## Prerequisites (one-time)

1. **Xcode** — install from the Mac App Store. Open it once and let it finish installing additional
   components if prompted.
2. **CocoaPods** — `sudo gem install cocoapods` (or `brew install cocoapods` if you use Homebrew).
   `npx cap sync ios` runs `pod install` for you, but only if CocoaPods is actually present — it was
   skipped here on Windows with a warning, so the very first sync on your Mac needs to do it for real.
3. **Node.js + pnpm** — same versions this repo already expects (`node >=20.9.0`, `pnpm@11.15.1` —
   see the root `package.json`).

## Getting the code and building

```bash
git clone <your fork/remote of veasna-os> veasna-os
cd veasna-os
git submodule update --init --recursive   # packages/vstudio and packages/vicons are submodules
pnpm install

# Build the web bundle and sync it (+ CocoaPods) into the iOS project
pnpm --filter vstudio-mobile build
cd apps/mobile
npx cap sync ios
```

`cap sync` copies `dist/` into `ios/App/App/public`, regenerates `ios/App/App/capacitor.config.json`,
and runs `pod install` in `ios/App`. Re-run this (from `apps/mobile`) any time the web bundle changes —
same as `npx cap sync android` on the Android side.

## Opening and running in Xcode

```bash
npx cap open ios
```

This opens **`ios/App/App.xcworkspace`** — always the `.xcworkspace`, never `App.xcodeproj` directly.
CocoaPods integration only works through the workspace; opening the plain `.xcodeproj` will fail to
resolve the `Capacitor`/`CapacitorCordova`/`CapacitorFilesystem` pod dependencies.

In Xcode:
1. Pick a Simulator (e.g. "iPhone 16") from the scheme selector next to the Run button — no signing
   needed for the simulator.
2. Hit **Run (▶)**.

**For a real device instead of the simulator:** select your device from the scheme selector, then
under the `App` target's **Signing & Capabilities** tab, pick your Apple ID under **Team** (a free
personal account works for local development — Xcode auto-manages a 7-day provisioning profile; a
paid Apple Developer account is only needed for TestFlight/App Store distribution). You'll also need
to trust the developer certificate once on the device itself (Settings → General → VPN & Device
Management) the first time you run it.

## What to verify (same loop already confirmed working on Android)

- App launches to the home page — project list loads (reads `~/Documents`-equivalent app-private
  storage on-device, same `@capacitor/filesystem`-backed native storage already verified on Android).
- Create a new project, open it — the real editor UI renders (Preview, Timeline, toolbar).
- **Media** toolbar button (film icon) — opens the media sheet, **Import** picks a file from Photos/
  Files, and it lands on the timeline.
- **Properties** toolbar button (gear icon) — swaps to the Inspector; shows "Select a clip..." with
  nothing selected, real controls once a clip is selected.
- Tap the mic icon to record a voiceover — iOS should prompt for microphone permission (this is what
  `NSMicrophoneUsageDescription`, already added to `Info.plist`, is for); confirm the prompt actually
  appears and recording works after granting it.
- Playback, scrubbing, trim — same as the already-working Android build.

**Known, expected limitation:** the Export button will show "FFmpeg isn't available on this machine."
That's correct for now — on-device export needs a native `ffmpeg-kit` plugin (plan Step 5), which
hasn't been built yet for either platform. Import/edit/preview/voiceover all work without it.

## If `pod install` fails

- `cd ios/App && pod repo update && pod install` — refreshes CocoaPods' own spec repo first, which
  fixes most "no podspec found for X" errors on a fresh CocoaPods install.
- As a last resort, delete `ios/App/Pods` and `ios/App/Podfile.lock`, then re-run `npx cap sync ios`
  from `apps/mobile` to regenerate them from scratch.

## Reporting back

Screenshots of the running app (or whatever error output you hit) are the most useful thing to send
back — this environment has no way to reproduce or debug the iOS side directly, so a build failure's
exact Xcode error text matters a lot more here than it would for the Android side.
