# VCut iOS beta — 0.2.17 (28)

Uploaded successfully to App Store Connect on October 13, 2026 at 01:17 SGT. Apple processing, TestFlight group availability, and external review approval remain unverified. Previous iOS build: 0.2.16 (27).

## Changes

- Friendly first-launch walkthroughs introduce the home tabs and editor: importing media, previewing, arranging clips, undo/redo and grouping, and exporting.
- Skip at any time; the choice is remembered on this device. Replay from Me or the editor account menu using “Show me around.” Skipping the home guide also suppresses the automatic editor guide.
- English and Khmer copy, keyboard focus handling, reduced-motion support, and layouts that adapt to portrait and landscape screens.

- Native export writes create missing parent folders for fonts, bundled sound effects, text files, text images, concat lists, and color images. Export preparation no longer silently ignores genuine directory-creation failures.
- Text rendering accepts a job scratch folder already created during LUT preparation instead of failing because the folder exists.
- Includes build 26's mobile undo/redo, touch selection and grouping workflow, native encoder fallback, browser Device export, and Auto recovery improvements. The admin dashboard is deployed separately at `https://vcut.io/admin`; it does not depend on a mobile update.

## Verification

| Check | Result |
| --- | --- |
| iPhone 17 Pro, iOS 26.5 simulator | 10 native tests passed for build 28, including skip/replay |
| Shared unit suite without external FFmpeg processes | 1,373 tests passed, including 6 new export directory regression checks |
| Mobile and Next.js production builds / TypeScript | Passed |
| Signed archive / App Store Connect upload | Signature verified; upload succeeded |
| Android companion build 23 | Signed AAB verified; same upload certificate as build 22 |
| Browser walkthrough checks | First launch, persistence, replay, keyboard focus, blocked storage, phone/desktop/landscape layouts, and Khmer passed |
| iOS/Android editor JavaScript | All four bundle hashes match |

The simulator checks include plugin availability, library import/persistence/deletion, sign-in UI, editor persistence, native FFmpeg success/failure/cancellation, insufficient storage, VideoToolbox export/WebKit playback, and styled-text export with Photos permission denied. Results: `ios/App/output/Tests-2FE7D6B1-1E85-48ED-8C65-4F078AA406DC-2026-10-12T17-13-12-108Z.xcresult`.

No physical iPhone, iPad, or Android device was connected for this fix. Device hardware behavior still needs testing. The broader host-render suite reported sticker-frame and FFmpeg text failures and was stopped during the long transition-render checks; it is not included in the passing unit count. Native text uses the simulator-tested canvas path.

## Artifacts and upload

- Bundle ID: `com.veasnawt.vcut`; version/build: `0.2.17` / `28`; minimum iOS: `16.4`.
- Signing team/profile: `7QA4U325BB` / `VCut Distribution`.
- IPA: `ios/App/output/VCut-0.2.17-28/App.ipa`.
- Archive: `ios/App/output/VCut-0.2.17-28.xcarchive`.
- Source fingerprints and signature verification: `build-info.json` and `verification.json` beside the IPA.
- Upload receipt: `ios/App/output/VCut-0.2.17-28/upload-result.json` (`exitCode: 0`, `uploaded: true`).
- IPA: 26,700,328 bytes; SHA-256: `f30aa5464dbbd03c49abe6ae7b5aedd5a81328282862b09a44be567667f40326`.

Archived from clean parent revision `aabeaa573db495e6be2009bba61d3a10a467066b` and VCut revision `b1a20fee2e6704a81900427f35e1d7c4f0111beb`, both pushed to GitHub. Generated artifacts and private signing material stay outside Git. Build/upload commands are in [IOS_SETUP.md](IOS_SETUP.md).

## TestFlight handoff

Apple processing, group assignment, and external review are separate from upload. Complete export compliance and add build 28 to the intended testing group before inviting testers.

The FFmpeg frameworks bundle OpenSSL/libsrt (`--enable-openssl`, `--enable-libsrt`, `--disable-securetransport`). The encryption declaration must reflect those bundled standard algorithms; do not claim Apple-only encryption. No French encryption declaration has been located or supplied. See [Apple's encryption documentation](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption).

Apple accepted this upload with non-blocking missing-dSYM warnings for eight prebuilt FFmpeg frameworks; keep the archive and available app/plugin dSYMs. StoreKit purchases and Apple sign-in are not configured in this beta. Account-deletion requests remain manually processed.

## What to Test

On a fresh installation, follow or skip the home guide and verify it stays dismissed after restarting. Replay it from Me. Open the editor and check its guide and account-menu replay. Try English and Khmer, rotate the phone, and confirm Skip and navigation buttons remain reachable.

Export a project immediately after opening the updated app. Try video/audio with text (including animated Khmer), color clips, bundled sound effects, and partial-intensity LUTs. Export the same project twice. Test Photos permission allowed and denied, sharing, cancellation, and reopening projects. Report device model, iOS version, and reproduction steps through Settings → Feedback.

## Android companion build

Signed AAB 0.2.17 (version code 23): `android/app/build/outputs/bundle/release/VCut-0.2.17-23.aab` (97,446,138 bytes).

SHA-256: `61b3c3171852c4635b5dabf271e05cf337e5c280ac593d640a3aa537a5392877`. JAR signature verification passed using the existing VCut upload certificate; all four editor JavaScript bundles match iOS build 28. Google Play upload and physical Android export testing were not performed. The temporary password file was removed after successful signing; `jks.credentials` is excluded from Git, Docker, and Railway upload contexts.

## Web release

Deployed source revision `aabeaa573db495e6be2009bba61d3a10a467066b` to Railway production at https://vcut.io on October 13, 2026 (SGT), deployment `d45c18d3-f828-4b68-a2d1-12189cbf4dc7`. The live home page serves the new interface-guide bundles. Home, landing, and admin pages return HTTP 200; unauthenticated admin API requests return HTTP 401 with private/no-store caching, and the admin page retains noindex. The embedded export worker started with concurrency 2. No database migration was needed for this release.
