# VCut iOS beta — 0.2.16 (27)

Uploaded successfully to App Store Connect on October 12, 2026 at 22:23 SGT. Apple processing, TestFlight group availability, and external review approval remain unverified. Previous iOS build: 0.2.16 (26).

## Changes

- Native export writes create missing parent folders for fonts, bundled sound effects, text files, text images, concat lists, and color images. Export preparation no longer silently ignores genuine directory-creation failures.
- Text rendering accepts a job scratch folder already created during LUT preparation instead of failing because the folder exists.
- Includes build 26's mobile undo/redo, touch selection and grouping workflow, native encoder fallback, browser Device export, and Auto recovery improvements. The admin dashboard is deployed separately at `https://vcut.io/admin`; it does not depend on a mobile update.

## Verification

| Check | Result |
| --- | --- |
| iPhone 17 Pro, iOS 26.5 simulator | 9 native tests passed for build 27 |
| Shared unit suite without external FFmpeg processes | 1,372 tests passed, including 6 new export directory regression checks |
| Mobile production build / TypeScript | Passed |
| Signed archive / App Store Connect upload | Signature verified; upload succeeded |
| Android companion build 22 | Signed AAB verified; same upload certificate as build 21 |
| iOS/Android editor JavaScript | All four bundle hashes match |

The simulator checks include plugin availability, library import/persistence/deletion, sign-in UI, editor persistence, native FFmpeg success/failure/cancellation, insufficient storage, VideoToolbox export/WebKit playback, and styled-text export with Photos permission denied. Results: `ios/App/output/Tests-2FE7D6B1-1E85-48ED-8C65-4F078AA406DC-2026-10-12T14-20-23-770Z.xcresult`.

No physical iPhone, iPad, or Android device was connected for this fix. Device hardware behavior still needs testing. The broader host-render suite reported sticker-frame and FFmpeg text failures and was stopped during the long transition-render checks; it is not included in the passing unit count. Native text uses the simulator-tested canvas path.

## Artifacts and upload

- Bundle ID: `com.veasnawt.vcut`; version/build: `0.2.16` / `27`; minimum iOS: `16.4`.
- Signing team/profile: `7QA4U325BB` / `VCut Distribution`.
- IPA: `ios/App/output/VCut-0.2.16-27/App.ipa`.
- Archive: `ios/App/output/VCut-0.2.16-27.xcarchive`.
- Source fingerprints and signature verification: `build-info.json` and `verification.json` beside the IPA.
- Upload receipt: `ios/App/output/VCut-0.2.16-27/upload-result.json` (`exitCode: 0`, `uploaded: true`).
- IPA: 26,695,253 bytes; SHA-256: `6a69fd2ffc9f94af52ee5c5b6205500e32eda10e07cc8247aef93bc4f966e0b7`.

Archived from clean parent revision `f02ad2923cac339d13f07e8cd03f39abc9558c2b` and VCut revision `0d2f3ed832c7155065179575bff6dd3381898fb1`, both pushed to GitHub. Generated artifacts and private signing material stay outside Git. Build/upload commands are in [IOS_SETUP.md](IOS_SETUP.md).

## TestFlight handoff

Apple processing, group assignment, and external review are separate from upload. Complete export compliance and add build 27 to the intended testing group before inviting testers.

The FFmpeg frameworks bundle OpenSSL/libsrt (`--enable-openssl`, `--enable-libsrt`, `--disable-securetransport`). The encryption declaration must reflect those bundled standard algorithms; do not claim Apple-only encryption. No French encryption declaration has been located or supplied. See [Apple's encryption documentation](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption).

Apple accepted this upload with non-blocking missing-dSYM warnings for eight prebuilt FFmpeg frameworks; keep the archive and available app/plugin dSYMs. StoreKit purchases and Apple sign-in are not configured in this beta. Account-deletion requests remain manually processed.

## What to Test

Export a project immediately after opening the updated app. Try video/audio with text (including animated Khmer), color clips, bundled sound effects, and partial-intensity LUTs. Export the same project twice. Test Photos permission allowed and denied, sharing, cancellation, and reopening projects. Report device model, iOS version, and reproduction steps through Settings → Feedback.

## Android companion build

Signed AAB 0.2.16 (version code 22): `android/app/build/outputs/bundle/release/VCut-0.2.16-22.aab` (97,441,084 bytes).

SHA-256: `dd9ad4d92bfdaaf7385aa737de6cdca6c080e9bbba3c1c58900089892c10089c`. JAR signature verification passed using the existing VCut upload certificate; all four editor JavaScript bundles match iOS build 27. Google Play upload and physical Android export testing were not performed. The temporary password file was removed after successful signing; `jks.credentials` is excluded from Git, Docker, and Railway upload contexts.
