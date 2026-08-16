import type { CapacitorConfig } from "@capacitor/cli";

// appId is a reverse-domain bundle identifier — App Store Connect and Google Play both treat it as
// effectively permanent once a real listing exists under it, so this is worth confirming (not just
// accepting the default) before ever submitting a real build. Picked to match this repo's existing
// "Veasna OS" branding; change here if that's not the intended final id.
const config: CapacitorConfig = {
  appId: "com.veasnaos.vstudio",
  appName: "VStudio",
  webDir: "dist",
};

export default config;
