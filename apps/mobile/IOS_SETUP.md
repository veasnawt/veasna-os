# VCut iOS build and test setup

VCut runs its shared editor inside Capacitor with native FFmpeg/VideoToolbox export, Photos saving, Filesystem, camera, sharing, microphone permissions, and authentication callbacks. Minimum deployment target: iOS 16.4; iPhone and iPad.

## Prerequisites

Use macOS with Xcode and an installed iOS SDK/simulator, CocoaPods, Node >=20.9, and pnpm 11.15.1. Initialize the `packages/vcut` and `packages/vicons` submodules, then install the workspace:

```bash
git submodule update --init --recursive
pnpm install --frozen-lockfile
```

## Signed beta build

From the repository root:

```bash
pnpm build:vcut-ios
```

This builds the icon package and mobile web bundle, downloads the LGPL FFmpeg frameworks if needed, syncs Capacitor and CocoaPods, archives Release for a physical iOS device, and exports an App Store Connect signed IPA. It exports to disk; it does not upload or distribute the build.

The current signer is Apple Distribution, team `7QA4U325BB`, with the manual `VCut Distribution` provisioning profile for `com.veasnawt.vcut`. The signing certificate and private key must be installed in Keychain. Export settings are in `ios/ExportOptions.plist`. Always open `ios/App/App.xcworkspace` in Xcode.

Outputs are under `ios/App/output/VCut-<version>-<build>/App.ipa`, with a sibling `.xcarchive`, source metadata, and SHA-256 verification information for the prepared build. Build numbers are never silently replaced. For the next build:

```bash
VCUT_IOS_BUILD_NUMBER=27 pnpm build:vcut-ios
```

If an archive succeeded but export failed, fix signing and resume with the same build number:

```bash
VCUT_IOS_BUILD_NUMBER=27 pnpm build:vcut-ios --export-only
```

To upload a verified candidate with the Apple Account stored in Xcode:

```bash
VCUT_IOS_BUILD_NUMBER=26 pnpm upload:vcut-ios
```

Alternatively configure `ASC_KEY_PATH`, `ASC_KEY_ID`, and `ASC_ISSUER_ID` together for an authorized App Store Connect API key. Keep the `.p8` private key outside the repository. Upload verifies the IPA checksum and signed archive fingerprint and records the attempt in `upload-result.json`. Apple processing and TestFlight group assignment follow separately; an exported IPA alone does not establish an upload.

Keep the Xcode marketing version aligned with `apps/mobile/package.json`.

## Simulator tests

List installed simulators and use a UUID:

```bash
xcrun simctl list devices available
VCUT_IOS_SIMULATOR_ID=<UUID> pnpm test:vcut-ios
```

This builds the web bundle and a test-only JavaScript library harness, syncs native dependencies, builds the hosted AppTests target, installs the app, denies Photos-add access, and runs the nine native tests. The harness is bundled only into AppTests; it is absent from release archives. Results are saved as `.xcresult` bundles under `ios/App/output`.

For Xcode's Test action, first run `node scripts/build-vcut-ios-tests.mjs`, then select an installed simulator in the App scheme. The generated library harness is ignored by Git.

The suite checks project creation/persistence, the email sign-in UI, native plugin and microphone permission availability, audio extraction, failure/cancellation, late completion delivery, custom libraries, H.264/AAC playback, and editor export of animated styled Khmer text. The export test checks the encoded frame for visible text. Simulator coverage complements the physical-device checklist in [IOS_BETA_RELEASE.md](IOS_BETA_RELEASE.md).

## Local development

```bash
pnpm --filter @veasnawt/vicons build
pnpm --filter vcut-mobile build
(cd apps/mobile/ios/App/FFmpegKitLGPL && bash setup_ios.sh)
pnpm --filter vcut-mobile exec cap sync ios
pnpm --filter vcut-mobile exec cap open ios
```

Use a development signing configuration to install directly on a registered device. The distribution profile used for beta export is for TestFlight, rather than direct device installation.

If FFmpeg downloading fails, use `FFMPEG_KIT_IOS_URL` to supply the same compatible 8.1.2 LGPL full framework archive from a trusted mirror. Do not substitute the GPL variant. Frameworks, Pods, derived data, exported IPAs, and generated test bundles stay out of Git.
