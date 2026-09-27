# VCut privacy disclosure review notes

Last updated: September 27, 2026. The app/public page share `packages/vcut/src/ui/PrivacyPolicy.tsx`. The current operator label is the VCut app name and the private Feedback inbox is the contact mechanism. A user-provided operator name/email can replace these defaults. Review these disclosures and retention practices before Store submission; the notes below are not a certification of compliance.

VCut is a video editor with optional cloud projects, creator profiles, templates and online tools. This policy covers the website and Android, iOS and desktop apps.

## Accounts and persistent sign-in

VCut uses Supabase to authenticate accounts. Account data includes email, account identifiers and profile information you provide, or receive from a sign-in provider. Sign-in credentials and refresh tokens are stored on your device so short-lived access tokens can refresh without signing in again. Desktop session storage uses operating-system encryption. Signing out removes the saved session; authentication providers can also revoke a session.

## Local projects, cloud projects and public content

Android and desktop projects are stored on your device. Using the web editor, uploading a project, enabling cloud sync, publishing a template or using an online tool can send the relevant project or media to the service. Cloud copies can include video, photos, audio, text, editing instructions, custom fonts, LUTs, sound effects and related preview files. Automatic sync uploads edits only for projects where you enable it; pausing sync does not delete an existing cloud copy.

Your username, creator name, avatar, bio, published templates, public comments and public profile activity, including visible likes and follow counts, may be visible to others. Unpublished projects are not public templates. Block lists, safety reports and feedback are private. Blocking changes signed-in feeds and interactions; it does not make previously public links private.

## Online services and billing

Authentication and account records use Supabase; service hosting uses Railway. Billing uses Stripe. Online AI tools may send your selected media, audio, prompt or editing request to processors such as Replicate. Stock and discovery features contact their content providers, including Pexels, GIPHY, KLIPY and Apple music/search services, when those features are used. Providers process the information required for their service under their own terms and policies. Data can be processed outside your country.

## Permissions, feedback and service operation

Media selection accesses the files you choose. Recording narration uses the microphone. Saving exports to your photo library uses the relevant platform permission. VCut requests permissions when needed; denying them can limit that feature without deleting your projects.

Feedback includes your account identifier, bug/idea category and message. Device details are optional and off by default; enabling them includes app version, platform, browser/user-agent, timezone and screen size. It does not attach project files or media. Safety reports include the reported content and your reason. We use these records to provide support, improve VCut and investigate abuse. Hosting services and local crash logs can record technical errors and request information needed to operate and protect the service.

## Retention and your choices

You can edit your profile, remove local projects, delete cloud projects, unpublish templates, pause sync and sign out. Removing the app's local data does not automatically delete cloud copies. Project and account data remain while needed to provide the service; feedback and safety records can remain while support, security or legal issues are handled. Contact the operator to request access, correction or account/data deletion. Some records may need to be retained for legal or security purposes; requests require enough information to verify ownership. The in-app account-deletion flow is still a beta-release gate and this policy must not imply it already exists.

## Contact and updates

Operator label: **VCut**. Privacy and data-deletion contact: **Me → Settings → Feedback**, with ownership verification for account requests. The operator name/contact-email question remains open for customization; do not invent an email or legal entity. Material changes should update the policy date and the published website/app policy together.
