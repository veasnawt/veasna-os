# VCut iOS beta candidate — 0.2.15 (25)

Uploaded to App Store Connect on 2026-10-11 at 03:12 SGT using Xcode 26.6 and the iOS 26.5 SDK. Xcode reported “Upload succeeded” and exited successfully. Build 25 includes the Capacitor security patch and the additional fixes below. Apple processing, TestFlight group availability, tester distribution, and external review approval have not been verified. External beta readiness still depends on the physical-device and account checks below.

## Signed artifacts

| Item | Location / value |
| --- | --- |
| IPA | `ios/App/output/VCut-0.2.15-25/App.ipa` |
| Xcode archive | `ios/App/output/VCut-0.2.15-25.xcarchive` |
| Source metadata | `ios/App/output/VCut-0.2.15-25/build-info.json` |
| Signature/profile verification | `ios/App/output/VCut-0.2.15-25/verification.json` |
| Bundle ID | `com.veasnawt.vcut` |
| Marketing version / build | `0.2.15` / `25` |
| Devices / minimum OS | iPhone and iPad / iOS 16.4 |
| Signing team / profile | `7QA4U325BB` / `VCut Distribution` |
| Profile expiration | 2027-09-18 |
| Upload receipt | `ios/App/output/VCut-0.2.15-25/upload-result.json` and `upload.log` |
| IPA bytes | 26,693,432 |
| IPA SHA-256 | `bb0c80df6c3fd0902b079eda21725662656cdedb20085ff2e9264bd4d281ca9a` |

The archive passes `codesign --verify --deep --strict`. Its profile enables beta reports, disables debugger access, and matches the bundle ID/team. App, Capacitor, and Cordova privacy manifests are bundled. The test harness and AppTests are absent from the release app. Keep the archive and dSYMs for symbolication. Upload produced non-blocking missing-dSYM warnings for the eight prebuilt FFmpeg frameworks; app, Capacitor, plugin, and Cordova dSYMs are present. Symbolication inside those FFmpeg frameworks remains limited unless matching vendor dSYMs are obtained.

Builds 21–24 are superseded. Build 25 adds the gain-automation accuracy fix and current feedback diagnostics. Use build 25. If App Store Connect already contains build 25, build a new number using the instructions in [IOS_SETUP.md](IOS_SETUP.md).

## What changed for iOS

- Updated Capacitor core, iOS, Android, and CLI to 7.6.9, which fixes [GHSA-rvm3-566m-v7fv](https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv). The mobile/shared production dependency audit reports no advisories. Major-version migrations are deferred.
- Library deletion now ignores only missing-file errors; storage/permission errors reach the UI. Failed bundled-font preparation can be retried.
- Gain automation uses short audio blocks to prevent fades lagging by roughly 85ms; both real audio/video ramp regression tests pass with FFmpeg 8.
- Settings includes a confirmed account-deletion request. The local server patch requires verified ownership and checks persistence errors. This remains a manually processed request, and the server patch has not been deployed.
- Feedback diagnostics use the mobile package version. Build/export records source fingerprints, archive signature identity, and IPA hashes; `pnpm upload:vcut-ios` verifies these before attempting upload.

- Native FFmpeg job state and cancellation are serialized; short-job terminal events survive late listener registration.
- Color clips are rendered into native export inputs instead of referencing a nonexistent media path.
- Animated text frame sequences get a native concat file before export. Styled Latin/Khmer text uses the preview canvas and exports through VideoToolbox H.264/AAC.
- Custom sounds, `.cube` LUTs, and `.ttf`/`.otf` fonts can be imported, previewed, persisted, and deleted on-device. iOS directory URL normalization fixes library preview paths, including downloaded cloud libraries.
- iOS account sign-in uses email codes. Google sign-in remains available where its native plugin is supported; Apple sign-in is not configured for this beta.
- iOS beta access uses the existing free plan and optional complimentary beta trial. Stripe checkout, paid credit packs, and billing-portal links are absent from the iOS upgrade flow. Existing account entitlements still apply. StoreKit purchases are a later release feature.
- Added the app privacy manifest (file timestamps, user defaults, and disk space), a native export storage check, hosted native tests, and repeatable signed archive/export and simulator-test commands.

## Verification

| Environment | Result |
| --- | --- |
| iPhone 17 Pro, iOS 26.5 simulator | 9 native tests passed |
| iPhone 16 Pro, iOS 18.6 simulator | 9 native tests passed |
| iPad Pro 11-inch M5, iOS 26.5 simulator | 9 native tests passed |
| Shared unit/graph suite without external render processes | 1,360 tests passed |
| Mobile production build and shared TypeScript check | Passed |
| Signed Release archive, App Store Connect export, signature verification | Passed |
| App Store Connect upload | Succeeded on 2026-10-11; processing/group availability unverified |

Native checks exercise project creation/persistence, the email sign-in UI, plugin and microphone permission availability, MP3 extraction, failure/cancellation, late completion delivery, insufficient export storage rejection, library imports/validation/deletion, H.264/AAC metadata and WebKit decoding, and editor export of a two-second color clip with animated styled Khmer text. The encoded frame is inspected for visible text, and the Photos-denied export remains available in app storage. Tests use real WKWebView, Filesystem, and FFmpeg rather than mocks.

The shared full render suite was also investigated. A fresh rerun with bundled FFmpeg 6 was stopped after repeated render timeouts. Its bundled host FFmpeg 6.0 has older filter support and produced 22 failures. The fresh full run with a temporary FFmpeg 8.0 test override passed 1,611/1,614 tests. The audio gain-ramp failure was fixed by limiting the audio blocks used for automation, and both real ramp regression tests now pass without loosening their assertions. Two variable-font-size drawtext cases still crash that host binary. Native text bypasses drawtext through the canvas path and passes the animated export check. The full shared suite is not green; the two host crashes remain for separate triage. The original bundled FFmpeg binary was not modified. iOS uses FFmpeg 8.1.2. The updated unit/graph suite separately passes all 1,360 tests.

Native test evidence is under `ios/App/output`:

- `iOS26-Build25.xcresult`
- `iOS18-Build25.xcresult`
- `iPad-Build25.xcresult`

The first iOS 18 attempt encountered the initial Photos system prompt before denial was applied; the repeat with Photos denied passed all nine checks. The test command installs the app and configures denial before running the suite.

No physical iPhone/iPad was connected. Simulator checks do not establish camera/voiceover recording, real hardware encoding speed, background behavior, actual share-sheet delivery, or authenticated cloud service behavior.

## Device and account checks before inviting testers

- Install through internal TestFlight on an iPhone and an iPad. Create, edit, close, relaunch, and reopen a project; verify persistence and safe areas in both orientations.
- Import representative Photos/Files media (H.264, HEVC `.mov`, JPEG/PNG, M4A/WAV); play, scrub, trim, layer, and export with audio, transitions, effects, LUTs, and custom fonts. Check long exports and storage use on an older device.
- Record a voiceover after microphone permission is granted; deny permission and verify recovery through Settings. Test camera/media-picker permissions and limited Photos access.
- Export with Photos allowed and denied. Confirm allowed exports appear in Photos, denied exports remain shareable, Save/Share works, and cancellation leaves the editor usable. Check background/foreground transitions during export.
- Use a real beta account to receive/verify an email code, relaunch with the session retained, sign out, and claim the optional complimentary trial. Verify billing status, profile editing, cloud project upload/download, template drafts, feedback, and network failure handling.
- Verify captions and cloud AI generation with a funded test account and configured service. These paid/authenticated paths were not exercised without an account. Do not promise unlimited AI credits or automatically granted Pro access.

Desktop/web-only functionality remains explicit in this candidate: Remove Object / local ProPainter setup, native proxy generation, and importing a template directly into an existing timeline are unavailable. Template draft creation and cloud download have native paths, but still need authenticated device verification. This beta does not establish feature parity for those desktop tools.

## TestFlight handoff

1. The user's October 11 screenshot confirms build 25 appears in TestFlight with **Missing Compliance**. Complete the encryption questionnaire below before assigning testers.
2. The upload step is complete: `VCUT_IOS_BUILD_NUMBER=25 pnpm upload:vcut-ios` succeeded using the Apple Account stored in Xcode. Do not upload another copy unless resolving an Apple-reported failure. Future candidates should use a new build number; the upload command also supports an authorized App Store Connect API key.
3. In **Manage → App Encryption Documentation**, select the second option, **Standard encryption algorithms instead of, or in addition to, using or accessing the encryption within Apple's operating system**. Inspection of build 25's archived `libavformat`/`libavutil` binaries found `--enable-openssl`, `--enable-libsrt`, and `--disable-securetransport`; `libavformat` also contains `OPENSSL_init_ssl` and `SSL_connect`. This build bundles third-party standard encryption and should not be declared Apple-OS-only. Answer any subsequent distribution questions accurately. [Apple's documentation](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption) lists a French encryption declaration for non-OS standard encryption when distributing on the App Store in France. The archive does not assert an unreviewed encryption exemption; do not add `ITSAppUsesNonExemptEncryption=false` merely to suppress this questionnaire.
4. Add build 25 to an internal testing group and run the physical-device checklist.
5. Complete beta app information, contact/reviewer details, and the release notes below. Supply a working reviewer account or documented email-code access if reviewing signed-in features; no reviewer credentials have been created.
6. Before external invitations, review the App Privacy answers against the actual cloud data behavior and bundled manifest. Verify the privacy/support pages and account-deletion process. Settings now has a dedicated deletion-request action. Requests still require operator follow-through; the local server hardening patch must be deployed and authenticated request handling verified before claiming external review readiness.
7. Submit the build for TestFlight App Review when required, then invite the external group or create the public test link after approval.

Apple references: [upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/), [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/), [beta export compliance](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-export-compliance-information-for-beta-builds/), [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

## Suggested “What to Test” text

VCut iOS beta: create and reopen projects, import your own media, edit the timeline, add styled or animated text (including Khmer), import fonts/LUTs/sounds, record a voiceover, and export/share an MP4. Please test Photos access both allowed and denied and report device model, iOS version, and steps for any issue through Me → Settings → Feedback. Email sign-in is available for account and cloud features; optional trial access depends on account eligibility. Purchases and desktop-only tools are not included in this build.

## Source handoff

The build was made from parent revision `b96223258933ecacbfda3fddf45874e9972283df` and VCut submodule revision `9ea9d496fb57a55ceb192502741ba24aae521b7c`, plus the uncommitted changes in this workspace. Nothing was pushed. Commit the changes inside `packages/vcut` first, then commit the parent repo's updated submodule pointer and native/build/documentation files so another checkout can reproduce the candidate. Keep private signing keys and generated artifacts outside Git.
