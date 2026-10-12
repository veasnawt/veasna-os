# VCut iOS beta — 0.2.16 (26)

Uploaded successfully to App Store Connect on October 12, 2026 at 20:35 SGT. This release fixes mobile history controls, grouping, and export reliability. Apple processing, TestFlight group availability, and external review approval remain unverified. Previous build: 0.2.15 (25).

## Changes

- Undo and redo remain reachable on mobile even when the timeline is collapsed. The action bar keeps history controls fixed while other actions scroll.
- Select mode lets touch users tap multiple clips without dragging. Group creation, selected-group highlighting, Edit group, Done editing, member selection, and Ungroup provide an explicit workflow. Undo/redo restores group selection. Audio-only selections can also be grouped; locked groups remain protected.
- iOS VideoToolbox permits software fallback when hardware encoding is unavailable. Native export bypasses browser codec checks.
- Browser Device export negotiates the exact supported AVC encoder configuration, preserves H.264 decoder metadata and NAL framing, waits for video seeks and transition composition, applies group transforms, and keeps speed-adjusted audio for the full clip duration.
- Decoder failures/timeouts and asynchronous encoder/muxer errors now fail clearly. Cancellation releases media resources. Auto can recover from a runtime local failure through the cloud renderer when available; unsupported effects route to the full renderer instead of silently disappearing.

## Verification

| Check | Result |
| --- | --- |
| iPhone 17 Pro, iOS 26.5 simulator | 9 native tests passed |
| iPhone 16 Pro, iOS 18.6 simulator | 9 native tests passed |
| iPad Pro 11-inch M5, iOS 26.5 simulator | 9 native tests passed |
| Shared unit/graph suite without external FFmpeg processes | 1,366 tests passed |
| Chrome actual Device export | 120 H.264 frames at 320×180/60fps decoded successfully; AAC audible at 1.5 seconds with a 2× audio clip |
| Auto mode runtime recovery | Simulated local GPU failure started exactly one cloud export and completed in the actual React dialog |
| Mobile production build / TypeScript | Passed |
| Signed archive / App Store Connect upload | Signature verified; upload succeeded |

Native tests exercise touch selection/grouping/undo/redo, animated Khmer text export and visible encoded pixels, Photos-denied recovery, H.264/AAC playback, library imports, persistence, native failures/cancellation, and insufficient storage. Results are under `ios/App/output/Tests-*.xcresult` dated October 12, 2026. Browser output validation used an independent FFmpeg decoder, which caught the replaced decoder-configuration and AVC-framing bugs before release.

No physical iPhone/iPad is connected. Real hardware encoding speed, camera/voiceover recording, share-sheet delivery, background behavior, and authenticated cloud services still need device testing. Earlier full host render testing left two dynamic-font-size drawtext crashes in the host FFmpeg binary unresolved; those external render tests are excluded from the unit count. Native text uses the tested canvas path.

## Artifacts and upload

- Bundle ID: `com.veasnawt.vcut`; version/build: `0.2.16` / `26`; minimum iOS: `16.4`.
- Signing team/profile: `7QA4U325BB` / `VCut Distribution`.
- IPA: `ios/App/output/VCut-0.2.16-26/App.ipa`.
- Archive: `ios/App/output/VCut-0.2.16-26.xcarchive`.
- Source fingerprints and signature verification: `build-info.json` and `verification.json` beside the IPA.
- Upload status: succeeded (`exitCode: 0`, `uploaded: true`), receipt: `ios/App/output/VCut-0.2.16-26/upload-result.json`.
- IPA: 26,695,209 bytes; SHA-256: `b956008b792523bec40857f3d5c9be3c86675e8d3f37789bef51c944cd1ad001`.

Archived from clean parent revision `ba191232df9802fde9e7a6b72e64bbb917091452` and VCut revision `e271292f958901f8d6408c8f69a19d5bfc1f202f`, both pushed to GitHub. Build metadata records source fingerprints. Generated artifacts and private signing material stay outside Git. Build/upload commands are in [IOS_SETUP.md](IOS_SETUP.md).

## TestFlight handoff

Apple processing, group assignment, and external review are separate from upload. Complete export compliance and add build 26 to the intended testing group before inviting testers.

The FFmpeg frameworks bundle OpenSSL/libsrt (`--enable-openssl`, `--enable-libsrt`, `--disable-securetransport`). In Manage → App Encryption Documentation select **Standard encryption algorithms instead of, or in addition to, using or accessing the encryption within Apple's operating system**. Answer France distribution accurately; no French encryption declaration has been located or supplied. Do not assert an unreviewed exemption merely to hide Missing Compliance. See [Apple's encryption documentation](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption).

Apple accepted this upload with non-blocking missing-dSYM warnings for eight prebuilt FFmpeg frameworks; keep the archive and available app/plugin dSYMs. External beta readiness also requires real-device checks, reviewer access, accurate privacy answers, and deployment/verification of the previously committed server account-deletion hardening. The deletion request remains manually processed. StoreKit purchases and Apple sign-in are not configured in this beta.

## What to Test

Try Undo/Redo with the timeline collapsed. Use Select to choose clips, Group, Edit group, Done editing, and Ungroup; confirm appearance and timing are preserved. Export representative video/audio with animated text (including Khmer), transitions, and group transforms. Test Photos permission allowed and denied, sharing, cancellation, and reopening projects. Report device model, iOS version, and reproduction steps through Settings → Feedback.

## Android companion build

Signed AAB 0.2.16 (version code 21): `android/app/build/outputs/bundle/release/VCut-0.2.16-21.aab` (97,441,012 bytes).

SHA-256: `fe209ad8ddd138329171d22b849f1e0fd45ddf455faeee7c85ba18248ae0ece9`. JAR signature verification passed using the existing VCut upload key (alias `vcut`, CN=Veasna TEP). The iOS and Android artifacts contain identical hashes for all four editor JavaScript bundles. Google Play upload and Android device export testing were not performed. The temporary password file was removed after signing; no signing credentials were committed.
