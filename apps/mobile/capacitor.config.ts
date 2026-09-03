import type { CapacitorConfig } from "@capacitor/cli";

// appId is a reverse-domain bundle identifier — App Store Connect and Google Play both treat it as
// effectively permanent once a real listing exists under it, so this is worth confirming (not just
// accepting the default) before ever submitting a real build. Picked to match this repo's existing
// "Veasna OS" branding; change here if that's not the intended final id.
const config: CapacitorConfig = {
  appId: "com.veasnaos.vcut",
  appName: "VCut",
  webDir: "dist",
  android: {
    // `index.css`'s `env(safe-area-inset-*)` padding on `#root` was confirmed on a real device to be
    // NOT enough by itself on Android — targetSdk 35 (`variables.gradle`) means Android 15+ enforces
    // edge-to-edge regardless of app opt-in, and Capacitor's own default here is "disable" (do
    // nothing), relying entirely on the WebView's own CSS `env()` support to pick up the right inset
    // values from window-inset dispatch. That didn't reliably happen (header text landed under the
    // status bar's clock/battery icons). "force" makes Capacitor itself set the WebView's native
    // margins to the real system-bar/cutout insets — unconditionally, on every API level, not just
    // 35+ — so the WebView's own viewport never extends under system chrome in the first place, and
    // doesn't depend on Chromium's inset-to-CSS propagation working correctly on every OEM's WebView
    // build. The `env()` padding in `index.css` still isn't harmful once this is on: with the WebView
    // already excluded from the unsafe area, `env()` just resolves to 0 there.
    adjustMarginsForEdgeToEdge: "force",
  },
};

export default config;
