# VCut 0.2.9 public beta preparation

The code targets a public beta. Store publication remains gated by the items below. Do not upload the debug APK or unsigned review AAB.

## Android / Play Console

- Application ID: `com.veasnawt.vcut`; version 0.2.9, version code 13; target SDK 36.
- Production upload signing is supplied only through `VCUT_UPLOAD_KEYSTORE`, `VCUT_UPLOAD_STORE_PASSWORD`, `VCUT_UPLOAD_KEY_ALIAS`, and `VCUT_UPLOAD_KEY_PASSWORD`. Keep the keystore outside the repository and back it up securely. Do not replace an existing Play upload key if this application already has one.
- Build shared assets with `pnpm --filter vcut-mobile build`, then `pnpm --filter vcut-mobile exec cap sync android`.
- From `apps/mobile/android`, run `gradlew.bat bundleRelease` with signing configured. Release builds fail if credentials are missing. `bundleRelease -PvcutUnsignedReview` creates an unsigned review bundle only.
- Enable Play App Signing in Play Console, upload the signed AAB, and choose **Open testing** for the public beta. Complete any account-specific testing eligibility requirements shown by Console.
- Verify native library 16 KB alignment and run Play's pre-launch report on the final signed bundle.
- Before submission: complete privacy policy, Data safety, content rating, target audience, app access instructions, screenshots, and billing declarations. Review account deletion and mobile digital-purchase requirements; the existing web billing flow is not proof of Play billing compliance.

[Target SDK requirements](https://developer.android.com/google/play/requirements/target-sdk) ? [16 KB page sizes](https://developer.android.com/guide/practices/page-sizes)

## Microsoft Store

- Create the Partner Center app and reserve VCut's name. Copy Package Identity Name, Publisher, and Publisher Display Name into `VCUT_STORE_IDENTITY`, `VCUT_STORE_PUBLISHER`, and `VCUT_STORE_PUBLISHER_NAME`.
- Run `pnpm build:vcut-desktop`, then `node scripts/build-vcut-store.mjs`. This uses the installed Electron Builder's APPX target, with the actual Partner Center identity. The ordinary EXE is for direct testing and is not represented as a signed Store submission.
- Submit the package through Partner Center, configure public availability, and describe it clearly as beta. Complete screenshots, age ratings, privacy policy, support contact, and declarations. Check certification on a clean Windows account.
- No Partner Center identity or production certificate has been provided yet. Packaging must not invent these values.

[Windows distribution choices](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/choose-distribution-path)

## iOS / Mac validation

The shared UI/assets are synchronized into iOS. Native additions include in-app creator profiles, the smaller vector launch mark, sign-in deep-link handling, and automatic saving of video exports to Photos.

On your Mac: install workspace dependencies, run `pnpm --filter vcut-mobile build` and `pnpm --filter vcut-mobile exec cap sync ios`, then `cd apps/mobile/ios/App && pod install`. Open `App.xcworkspace`, select the intended signing team, and archive with Xcode. Validate Photos permission accepted/denied, cold and warm OAuth callbacks, keyboard visibility, and device exports before uploading to TestFlight. The existing signing team/profile must be checked against your account.

Swift/Xcode compilation and device testing cannot be verified on this Windows machine. If planning an App Store release, also audit account deletion, third-party sign-in, and in-app purchase requirements.

[Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/)

## Safety operations

Migration `0017_content_safety.sql` was approved and the user confirmed running it. Reports and block lists are private, with authenticated server writes. Report controls are available on profiles, templates and comments; blocked creators are managed in Settings. Blocking hides content in signed-in feeds and prevents interactions in both directions. Public anonymous links remain public.

An operator must monitor the private `content_reports` queue using Supabase service/admin access. Query pending/reviewing reports, inspect the referenced content, and apply the appropriate existing unpublish/delete moderation action. Set `status` and `reviewed_at` after review. Do not expose reports or reporter identity through public APIs. Confirm the moderation staffing, escalation and response process before opening the public beta.

## Export validation limits

The shared export regression suite exercises real FFmpeg rendering plus keyframes, transitions, filters, grading, text, sprites and cutout combinations. It passed 1,522 tests during this work. This is not a guarantee for every device or all combinations.

Native export now resolves project LUT files, blends partial LUT intensity, loads project custom fonts for text rasterization, and explicitly fails oversized animated-text renders instead of silently losing styling. Animated text rasterization is capped at 4,096 frames. Native face-effect prepasses remain unsupported and must not be advertised as complete. Live paid AI provider jobs were not run as part of verification.

Before public release, run the same representative complex timeline on Android, Windows and iOS and compare output against preview. Check export completion, cancellation, gallery/Videos save, permissions denied, cloud-downloaded custom fonts/LUTs, animated gradients/strokes, portrait/landscape and audio sync. Record device/OS and the exact signed build. An Android device and Mac build are still required for these native checks.

## Current publication blockers

Production Android upload signing; Partner Center identity; real-device export and keyboard checks; iOS archive validation; account deletion flow and store billing/sign-in compliance review; moderation operations; listing/legal declarations. This file is preparation, not a claim that the apps have been published or certified.
