# VCut iOS beta — 0.2.18 (29)

Uploaded successfully to App Store Connect on October 13, 2026 at 07:20 SGT. Apple processing, TestFlight group availability, and external review approval remain unverified. Previous iOS build: 0.2.17 (28).

## Changes

- Undo/redo shares the playback row above the timeline. Previous/Next cut sit beside Play; Safe guides is on the left. Removed frame-step buttons and kept the mobile controls in one row.
- Dark play button, full toolbar labels, and matching typography/baselines for the left time display and ruler.
- Grouped clips snap their combined preview bounds to the frame and other visible clips, including nested rotated/scaled parents. Larger corner targets and a visible rotation handle improve touch manipulation.
- Native thumbnails, filmstrips, waveforms, sticker sprites, and export URLs preserve device file paths instead of appending web-only resource parameters.
- Shared image loading fades in decoded thumbnails and supplies fallback artwork for missing images across project, media, template, and editor cards. Static template grids load posters without creating idle video decoders. Native video thumbnails load near the viewport and clamp their seek time.
- Includes the skippable first-launch guides from 0.2.17 and prior native export directory fixes.

## Verification

| Check | Result |
| --- | --- |
| Shared unit suite without external FFmpeg processes | 1,378 tests passed |
| iPhone 17 Pro / iOS 26.5 simulator | 10 tests passed |
| Mobile production build / TypeScript | Passed |
| Next.js production build | Passed |
| Browser controls | Layout, safe-guide toggle, and previous/next-cut navigation passed at 320, 390, 844, and 1440 px |
| Browser group gestures | Dragging, frame-center snapping, and one-step undo/redo passed |
| Browser thumbnails | Missing-image artwork and real fallback source passed |
| Toolbar layouts | Phone, landscape, desktop, and Khmer labels checked |

Simulator result: `ios/App/output/Tests-2FE7D6B1-1E85-48ED-8C65-4F078AA406DC-2026-10-12T23-17-42-907Z.xcresult`.

No physical iPhone, iPad, or Android device was connected. The passing unit count excludes external FFmpeg host-render tests; previously reported sticker-frame and host FFmpeg text failures were not re-evaluated for this UI release.

## What to Test

Use Previous/Next cut beside Play, toggle Safe guides, and undo/redo a group move. Drag a group near frame edges/center and another clip; verify snapping, scaling, rotation, and undo. Check long and Khmer toolbar labels, portrait/landscape layout, reopening projects, template grids, and imported media thumbnails. Export using Auto and Device with text, LUTs, audio, sharing, and Photos permission allowed/denied.

## Artifacts and upload

- Bundle ID: `com.veasnawt.vcut`; version/build: `0.2.18` / `29`; minimum iOS: `16.4`.
- Signing team/profile: `7QA4U325BB` / `VCut Distribution`.
- IPA: `ios/App/output/VCut-0.2.18-29/App.ipa`.
- Archive: `ios/App/output/VCut-0.2.18-29.xcarchive`.
- Source fingerprints and signature verification: `build-info.json` and `verification.json` beside the IPA.
- Upload receipt: `ios/App/output/VCut-0.2.18-29/upload-result.json` (`exitCode: 0`, `uploaded: true`).
- IPA: 26,701,953 bytes; SHA-256: `0ac336eb20cf9beff8aca970cbdf3bd1ef13f2c993bfa153823c01b557efd272`.

Archived from clean parent revision `960dec8ee22b1141bd25277fbddf633ba614b63a` and VCut revision `0ffb6c310a1e64d1c4a132615cb6cd50d124c2fd`, both pushed to GitHub. Generated artifacts and private signing material stay outside Git. Build/upload commands are in [IOS_SETUP.md](IOS_SETUP.md).

## TestFlight handoff

Apple processing, group assignment, and external review are separate from upload. Complete export compliance and add build 29 to the intended testing group before inviting testers.

The FFmpeg frameworks bundle OpenSSL/libsrt (`--enable-openssl`, `--enable-libsrt`, `--disable-securetransport`). The encryption declaration must reflect those bundled standard algorithms; do not claim Apple-only encryption. No French encryption declaration has been located or supplied. See [Apple's encryption documentation](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption).

Apple accepted this upload with non-blocking missing-dSYM warnings for eight prebuilt FFmpeg frameworks; keep the archive and available app/plugin dSYMs. StoreKit purchases and Apple sign-in are not configured in this beta. Account-deletion requests remain manually processed.

## Android companion build

Signed AAB 0.2.18 (version code 24): `android/app/build/outputs/bundle/release/VCut-0.2.18-24.aab` (97,447,760 bytes).

SHA-256: `8a913944a39896181b95cd7baf92d2c1d5dc54cfc4a30f1a9988f319e42ea657`. Signature verification passed, and the upload certificate matches build 23. The manifest version and ZIP integrity were verified; all four JavaScript bundles match iOS build 29. The verification receipt is beside the AAB. Google Play upload and physical Android testing were not performed. The temporary password file was removed after successful signing; `jks.credentials` remains excluded from Git, Docker, and Railway upload contexts.

## Web release

Deployed source revision `960dec8ee22b1141bd25277fbddf633ba614b63a` to Railway production at https://vcut.io on October 13, 2026 (SGT), deployment `afbdb8a3-bb60-4c0f-af82-3308cdb5a2cb` (SUCCESS). The live home page serves the new thumbnail-loader bundles. Landing, home, and admin pages return HTTP 200; unauthenticated admin API requests return HTTP 401 with private/no-store caching, and the admin page retains noindex. The embedded export worker started with concurrency 2. No database migration was required.
