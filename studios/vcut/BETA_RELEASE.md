# VCut public beta preparation

The user confirmed running `supabase/migrations/0019_review_comments.sql`.
Schema checks passed. The review-comments extension, owner-only editor,
hidden-deletion, outro export and timeline readiness fixes are live in deployment
`b37a8c0b-d3fa-4d64-a7b5-1fa4fa15fc4b`.

The code targets a public beta. Store publication remains gated by the items below. Do not upload the debug APK or unsigned review AAB.

## 0.2.14 verified local builds

| Artifact | Path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Android test APK | `apps/mobile/android/app/build/outputs/apk/debug/VCut-0.2.14-beta-debug.apk` | 201133493 | `DB7CF5EBF556C48BAC2ADDE6CF7B0FF1BEFB3FF03984E91C89A5C240603D27AB` |
| Unsigned AAB for review only | `apps/mobile/android/app/build/outputs/bundle/release/VCut-0.2.14-unsigned-review.aab` | 96762184 | `8062136E4AF4C860DFBC9A8A345289B621E875ACB6F3FD81DCD4079C40CDF0D1` |
| Windows test installer | `apps/vcut-desktop/release/VCut Setup 0.2.14.exe` | 345622432 | `BBC4A226E27055DC56E5587C54054A50243E0CEB2E169B8AAB20698C17B21754` |

Android 0.2.14/build 18 targets SDK 36. The APK passed v2 signature and 16 KB
ZIP alignment checks. The APK, AAB, and synced Android assets contain the
exact same `index-hpN7WojR.js` bundle (SHA-256
`CCBE2188776536A957C4D93F91BEB4C72A2B0CF87CB366BC49331FD1F4C998B5`).
The Windows installer builds successfully with product version 0.2.14.0.
Its packaged app contains the updated Next standalone server (BUILD_ID
`HRInnUcMXpu3w65zriV1o`), bundled fonts, SFX, FFmpeg/FFprobe, Puppeteer browser,
and bundled images (`vcut-transparent.png`, `vcut-outro-bg.png`) resolving the
local outro export logo and timeline interaction readiness gating.
Native iOS building and device testing still require Xcode on a Mac.

## 0.2.13 verified local builds

| Artifact | Path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Android test APK | `apps/mobile/android/app/build/outputs/apk/debug/VCut-0.2.13-beta-debug.apk` | 200594955 | `D46E39D16573B8E2C1B77D0C51F9FE6578EBF0CCAC19AA6A60E1AF79E833076A` |
| Unsigned AAB for review only | `apps/mobile/android/app/build/outputs/bundle/release/VCut-0.2.13-unsigned-review.aab` | 96761470 | `BA01CB95BFFE0045603553E48416F6D2033C1607EC849975C0CB2AE9D0366861` |
| Windows test installer | `apps/vcut-desktop/release/VCut Setup 0.2.13.exe` | 342879778 | `3325FB2F342D785996AEEB80417A982DCEC375646C6FDAE8CA34A626EEE524CE` |

Android 0.2.13/build 17 targets SDK 36. The APK passed v2 signature and 16 KB ZIP
alignment checks. The APK, AAB, Android and iOS shared assets contain the exact same
`index-ClVp2qJG.js` bundle (SHA-256
`A82070D3268A9881BC83607A02FED018C5EF6E1B4A9EFCE290E29F45D7A66C84`).
The Windows installer builds successfully and reports product version 0.2.13.0.
Its packaged app contains the review API route and the same Next BUILD_ID
`AEpuS43ABUDQ6Uuj18ZzP` as the production desktop build. Physical device and
Mac/Xcode checks remain outstanding; these test artifacts are not Store uploads.

## Prior 0.2.12 verified local builds

| Artifact | Path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Android test APK | `apps/mobile/android/app/build/outputs/apk/debug/VCut-0.2.12-beta-debug.apk` | 200587038 | `21235eb5578cd3a4b0da0ec4d018248cdcc0caf217862447755f2be900099281` |
| Unsigned AAB for review only | `apps/mobile/android/app/build/outputs/bundle/release/VCut-0.2.12-unsigned-review.aab` | 96754664 | `BC26BF7A1F1E53D543C4DB13FADB9A5DF271B41C109C6E65E427F1E0E108BD67` |
| Windows test installer | `apps/vcut-desktop/release/VCut Setup 0.2.12.exe` | 342805088 | `2D2C0F7811F70BF3ED83F5F59F05CE75A7A9F817434CDF02758D42B1B3F2F056` |

The 0.2.12 APK/AAB shared assets match that earlier mobile build. APK v2 signature, ZIP alignment and all 20 ARM64/x86_64 native ELF libraries passed 16 KB alignment checks. Release signing protection also rejects aggregate `:app:bundle` without credentials or the explicit review flag. The older Windows installer includes the standalone server, static assets, fonts and FFmpeg; a real export from its packaged server saved matching bytes into Videos/VCut. These artifacts are local test builds, not Store submissions.

## Android / Play Console

- Application ID: `com.veasnawt.vcut`; version 0.2.14, version code 18; target SDK 36.
- Production upload signing is supplied only through `VCUT_UPLOAD_KEYSTORE`, `VCUT_UPLOAD_STORE_PASSWORD`, `VCUT_UPLOAD_KEY_ALIAS`, and `VCUT_UPLOAD_KEY_PASSWORD`. Keep the keystore outside the repository and back it up securely. Do not replace an existing Play upload key if this application already has one.
- Build shared assets with `pnpm --filter vcut-mobile build`, then `pnpm --filter vcut-mobile exec cap sync android`.
- From `apps/mobile/android`, run `gradlew.bat bundleRelease` with signing configured. Release builds fail if credentials are missing. `bundleRelease -PvcutUnsignedReview` creates an unsigned review bundle only.
- Enable Play App Signing in Play Console, upload the signed AAB, and choose **Open testing** for the public beta. Complete any account-specific testing eligibility requirements shown by Console.
- Verify native library 16 KB alignment and run Play's pre-launch report on the final signed bundle.
- Before submission: review the published privacy policy and complete Data safety, content rating, target audience, app access instructions, screenshots, and billing declarations. Review account deletion and mobile digital-purchase requirements; the existing web billing flow is not proof of Play billing compliance.

[Target SDK requirements](https://developer.android.com/google/play/requirements/target-sdk) Â· [16 KB page sizes](https://developer.android.com/guide/practices/page-sizes)

## Microsoft Store

- Create the Partner Center app and reserve VCut's name. Copy Package Identity Name, Publisher, and Publisher Display Name into `VCUT_STORE_IDENTITY`, `VCUT_STORE_PUBLISHER`, and `VCUT_STORE_PUBLISHER_NAME`.
- Run `pnpm build:vcut-desktop`, then `node scripts/build-vcut-store.mjs`. This uses the installed Electron Builder's APPX target, with the actual Partner Center identity. The ordinary EXE is for direct testing and is not represented as a signed Store submission.
- Submit the package through Partner Center, configure public availability, and describe it clearly as beta. Complete screenshots, age ratings, privacy policy, support contact, and declarations. Check certification on a clean Windows account.
- No Partner Center identity or production certificate has been provided yet. Packaging must not invent these values.

[Windows distribution choices](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/choose-distribution-path)

## iOS / Mac validation

The shared UI/assets are synchronized into iOS. Native additions include in-app creator profiles, the smaller vector launch mark, sign-in deep-link handling, and automatic saving of video exports to Photos.

Minimum iOS version is 16.4 in both CocoaPods and Xcode settings. The Tailwind v4 UI requires Safari 16.4; allowing iOS 15 would expose unsupported styling. [Tailwind browser compatibility](https://tailwindcss.com/docs/compatibility)

On your Mac: install workspace dependencies, run `pnpm --filter vcut-mobile build` and `pnpm --filter vcut-mobile exec cap sync ios`, then `cd apps/mobile/ios/App && pod install`. Open `App.xcworkspace`, select the intended signing team, and archive with Xcode. Validate Photos permission accepted/denied, cold and warm OAuth callbacks, keyboard visibility, and device exports before uploading to TestFlight. The existing signing team/profile must be checked against your account.

Swift/Xcode compilation and device testing cannot be verified on this Windows machine. If planning an App Store release, also audit account deletion, third-party sign-in, and in-app purchase requirements.

[Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/)

## Feedback and privacy operations

Settings now offers private Feedback (bug/idea) and an offline Privacy Policy on Android,
iOS and desktop. The same policy is public at [vcut.io/privacy](https://vcut.io/privacy)
and linked from sign-in. Migration `0018_user_feedback.sql` was approved and confirmed
applied. Live checks verified authenticated submission, validation, optional diagnostics,
and denial of direct anonymous/authenticated reads and writes.

Review the private `user_feedback` queue in Supabase with operator/admin access. Its status
values are `pending`, `reviewing` and `resolved`; set `reviewed_at` when handling a request.
The current privacy contact mechanism is **Me > Settings > Feedback**, using VCut as the
operator label. The user has not supplied an operator legal name/contact email yet; replace
these defaults if provided and align Store disclosures with the actual operations. Handle
privacy/data-deletion requests only after verifying ownership. An account-deletion flow and
public deletion-request page remain Store-release gates; this policy does not complete them.

Persistent sign-in refreshes rejected access tokens once and provides reachable recovery
when authentication cannot be restored. Windows uses operating-system encrypted session
storage across changing loopback ports. Revoked sessions can still require reauthentication;
private account UI is cleared while local projects remain accessible.

## Content safety operations

Migration `0017_content_safety.sql` was approved and the user confirmed running it. Live checks passed for authentication/CORS, report and block-list privacy, reciprocal block enforcement, follow removal, and unblock using two temporary QA accounts; all QA accounts and records were cleaned up. Reports and block lists are private, with authenticated server writes. Report controls are available on profiles, templates and comments; blocked creators are managed in Settings. Blocking hides content in signed-in feeds and prevents interactions in both directions. Public anonymous links remain public.

An operator must monitor the private `content_reports` queue using Supabase service/admin access. Query pending/reviewing reports, inspect the referenced content, and apply the appropriate existing unpublish/delete moderation action. Set `status` and `reviewed_at` after review. Do not expose reports or reporter identity through public APIs. Confirm the moderation staffing, escalation and response process before opening the public beta.

## Export validation limits

The shared export regression suite exercises real FFmpeg rendering plus keyframes, transitions, filters, grading, text, sprites and cutout combinations. It passed 1,529 tests for the 0.2.11 release. This is not a guarantee for every device or all combinations.

Native export now resolves project LUT files, blends partial LUT intensity, loads project custom fonts and renders all native text through the preview canvas, and explicitly fails oversized animated-text renders instead of silently losing styling. Animated text rasterization is capped at 4,096 frames. Face-effect preprocessing has no configured export provider and remains unsupported on all platforms; licensed provider configuration and an export adapter are required before advertising this feature as complete. Live paid AI provider jobs were not run as part of verification.

A browser test of the actual native text preparation path matched the preview canvas exactly for bold text, white outline and emoji (2,062 visible pixels, maximum channel difference 0). Its export graph uses the rendered overlay rather than native drawtext. This checks rasterization and graph wiring, not Android/iOS FFmpeg output on a physical device.

Before public release, run the same representative complex timeline on Android, Windows and iOS and compare output against preview. Check export completion, cancellation, gallery/Videos save, permissions denied, cloud-downloaded custom fonts/LUTs, animated gradients/strokes, portrait/landscape and audio sync. Record device/OS and the exact signed build. An Android device and Mac build are still required for these native checks.

## Current publication blockers

Production Android upload signing; Partner Center identity; real-device export and keyboard checks; iOS archive validation; account deletion flow and store billing/sign-in compliance review; moderation operations; listing/legal declarations. This file is preparation, not a claim that the apps have been published or certified.

## 0.2.11 verification and animation continuation

Account, cloud download, empty project cover and duplicate timeline scrollbar fixes ship in
these artifacts (root `bd913e8`, shared `8f23155`). Mobile assets are `index-B0ytBEH9.js`;
Windows Next BUILD_ID is `OrogpiiIMhj1Rf1Lj_kpY`. Real packaged-server export passed
byte-identical automatic saving. APK/AAB assets, debug signing, ZIP/native 16 KB alignment,
version 0.2.11/build 15 and actual installer payload checks passed.

Hosted deployment `987c4038-d73d-411c-bea7-297070a3bd91` is SUCCESS with a RUNNING instance
and deploymentStopped=false. Homepage and Privacy Policy returned HTTP 200.

The expanded keyframe request is being implemented after this release; it is not included
in the artifacts above. See KEYFRAME_SYSTEM_PLAN.md for the audit and implementation plan.

## 0.2.12 animation and groups

Shared editor `1746e22` and host `862400c` add the completed animation/corners/mask
foundation and persistent animated groups. Old schema-1 projects load; new saves use
schema 2 and must be opened by an updated app. No database migration is required.
Deployment `7d5ccdca-d7a6-40c0-ac38-9f7d722a50a4` is SUCCESS/RUNNING and the home and
privacy pages return HTTP 200.

The full editor suite passed 1,587 tests; 29 focused tests passed after the final
multi-group move and collage-copy fixes. Browser workflows passed, grouped text
preview/export pixels matched over 48 frames, and a real packaged-server export
with rounded media, outlined text and animated group scale/rotation/opacity passed
with automatic saving. Mobile production build and Android/iOS asset sync passed.
iOS CocoaPods/Xcode steps require the Mac and were not executed on Windows.

Windows packaging now bundles Puppeteer's matching headless renderer and license,
and passes its executable to the server. A clean build machine must first run
`pnpm --filter vcut exec puppeteer browsers install chrome-headless-shell`.
End users do not need a browser cache for styled, grouped or Khmer text export.
The empty-cache packaged-server group/text export passed. Browser startup and
explicit page readiness allow 120 seconds for slow initial I/O; each frame loads
its actual font before rendering. Export does not wait for unrelated network
activity to become idle.

Puppeteer is pinned to **24.43.1**, compatible with the packaged Electron runtime
Node **20.18.3**. Puppeteer 25 requires Node 22.12+ and cannot be used here without
updating Electron. The actual Electron runtime successfully launched the matching
renderer and drew exact canvas pixels. Packaging checks both renderer package
versions and the required browser V8 snapshot. The local browser download was
repaired from its verified archive after C: ran out of space; its build cache is
now on D: with the original cache paths preserved by directory junctions.

Final editor polish is in shared `cbd9e01` (implementation `3ed6cb5`) and host
`653946c`. The full editor suite passed 1,592 tests across 297 suites.
Timeline keyframe controls now leave clip dragging alone; Animation presets
indicate their real state and ask before replacing manual keys. Clear All
Keyframes is undoable and retains the displayed pose. Properties panels and
Linear Mask canvas controls received focused usability fixes; see
`packages/vcut/EDITOR_UI_POLISH_AUDIT.md` for the audit and scope.

Android verification completed after the final mobile build: APK 0.2.12/build
16, target SDK 36, v2 debug signing, ZIP alignment and all 20 checked 64-bit
ELF libraries passed 16 KB alignment. APK and unsigned review AAB assets,
plus iOS synced assets, match that final mobile build. The hashes are in the
table above. Neither binary has been tested on a physical Android device here.

The Windows installer contains the current Next BUILD_ID
`4gWaricY63UErQUm-IVqc`, static assets, fonts, FFmpeg, Puppeteer renderer and
license. Its actual packaged Electron Node 20.18.3 runtime launched the
bundled Chrome headless shell 148.0.7778.97. Its packaged server exported a
project with animated groups, rounded media and styled text and saved the
video automatically. The installer is unsigned and was not installed as an
end-user app during this check. Existing public-beta publication blockers
still apply.

Hosted deployment `93ea212d-1239-4656-8ba1-b56f262d98a9` reached SUCCESS
and its container reported ready. The home, editor and privacy pages returned
HTTP 200 after deployment.

## 0.2.13 review comments

Migration `0019_review_comments.sql` was confirmed applied by the user. Read-only
schema checks returned 200 for `project_reviewers`, new `template_comments`
columns and `can_read_project_review`. The production deployment
`22975cbc-ba89-4774-9edd-a122191f30d2` reached SUCCESS, started its Next
server, and returned HTTP 200 at `vcut.io`.

An isolated live two-account workflow passed reviewer invitation, read-only
project playback access, denial of project writes and unreferenced media,
timestamped and general comments, one-level replies, invited-only mentions,
author-only edits, resolution/reopen, parent tombstones preserving replies,
timeline markers, Supabase RLS and access revocation. Its project and accounts
were removed. CI run `36387913218` passed typecheck, 1,594 tests, lint and the
production build. The feature reuses `template_comments` and Realtime; no
notification delivery exists yet. Native device interaction and iOS compilation
still require actual Android and Mac/iOS testing.
