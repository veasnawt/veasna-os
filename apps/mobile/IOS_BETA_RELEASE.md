# VCut iOS beta — 0.2.16 (26)

Release candidate for the mobile history controls, grouping workflow, and export reliability fixes. Build and upload receipts are recorded below after release preparation. Previous build: 0.2.15 (25), uploaded October 11, 2026.

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
| Mobile production build / TypeScript | Passed |

Native tests exercise touch selection/grouping/undo/redo, animated Khmer text export and visible encoded pixels, Photos-denied recovery, H.264/AAC playback, library imports, persistence, native failures/cancellation, and insufficient storage. Results are under `ios/App/output/Tests-*.xcresult` dated October 12, 2026. Browser output validation used an independent FFmpeg decoder, which caught the replaced decoder-configuration and AVC-framing bugs before release.

No physical iPhone/iPad is connected. Real hardware encoding speed, camera/voiceover recording, share-sheet delivery, background behavior, and authenticated cloud services still need device testing. Earlier full host render testing left two dynamic-font-size drawtext crashes in the host FFmpeg binary unresolved; those external render tests are excluded from the unit count. Native text uses the tested canvas path.

## Artifacts and upload

- Bundle ID: `com.veasnawt.vcut`; version/build: `0.2.16` / `26`; minimum iOS: `16.4`.
- Signing team/profile: `7QA4U325BB` / `VCut Distribution`.
- IPA: `ios/App/output/VCut-0.2.16-26/App.ipa`.
- Archive: `ios/App/output/VCut-0.2.16-26.xcarchive`.
- Source fingerprints and signature verification: `build-info.json` and `verification.json` beside the IPA.
- Upload status: pending signed archive preparation. The authoritative receipt will be `ios/App/output/VCut-0.2.16-26/upload-result.json`.

Commit the VCut submodule and parent before archiving; build metadata records both revisions and source fingerprints. Generated artifacts and private signing material stay outside Git. Build/upload commands are in [IOS_SETUP.md](IOS_SETUP.md).

## TestFlight handoff

Apple processing, group assignment, and external review are separate from upload. Complete export compliance and add build 26 to the intended testing group before inviting testers.

The FFmpeg frameworks bundle OpenSSL/libsrt (`--enable-openssl`, `--enable-libsrt`, `--disable-securetransport`). In Manage → App Encryption Documentation select **Standard encryption algorithms instead of, or in addition to, using or accessing the encryption within Apple's operating system**. Answer France distribution accurately; no French encryption declaration has been located or supplied. Do not assert an unreviewed exemption merely to hide Missing Compliance. See [Apple's encryption documentation](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption).

Prebuilt FFmpeg framework dSYMs were missing in the previous upload; keep the archive and available app/plugin dSYMs. External beta readiness also requires real-device checks, reviewer access, accurate privacy answers, and deployment/verification of the previously committed server account-deletion hardening. The deletion request remains manually processed. StoreKit purchases and Apple sign-in are not configured in this beta.

## What to Test

Try Undo/Redo with the timeline collapsed. Use Select to choose clips, Group, Edit group, Done editing, and Ungroup; confirm appearance and timing are preserved. Export representative video/audio with animated text (including Khmer), transitions, and group transforms. Test Photos permission allowed and denied, sharing, cancellation, and reopening projects. Report device model, iOS version, and reproduction steps through Settings → Feedback.
