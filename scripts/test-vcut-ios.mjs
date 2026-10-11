import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
if (process.platform !== "darwin") throw new Error("iOS tests require macOS and Xcode.");
const simulator = process.env.VCUT_IOS_SIMULATOR_ID;
if (!simulator) throw new Error("Set VCUT_IOS_SIMULATOR_ID to an installed simulator UUID (xcrun simctl list devices available).");
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`);
}
run("pnpm", ["--filter", "@veasnawt/vicons", "build"]);
run("pnpm", ["--filter", "vcut-mobile", "build"]);
run("bash", ["setup_ios.sh"], resolve("apps/mobile/ios/App/FFmpegKitLGPL"));
run("pnpm", ["--filter", "vcut-mobile", "exec", "cap", "sync", "ios"]);
run("node", ["scripts/build-vcut-ios-tests.mjs"]);
const derivedData = "apps/mobile/ios/DerivedData";
const args = ["-workspace", "apps/mobile/ios/App/App.xcworkspace", "-scheme", "App", "-configuration", "Debug",
  "-destination", `platform=iOS Simulator,id=${simulator}`, "-derivedDataPath", derivedData, "CODE_SIGNING_ALLOWED=NO"];
run("xcodebuild", [...args, "build-for-testing"]);
// boot returns nonzero if already booted; bootstatus reports actual readiness.
spawnSync("xcrun", ["simctl", "boot", simulator], { stdio: "ignore" });
run("xcrun", ["simctl", "bootstatus", simulator, "-b"]);
run("xcrun", ["simctl", "install", simulator, `${derivedData}/Build/Products/Debug-iphonesimulator/App.app`]);
run("xcrun", ["simctl", "privacy", simulator, "revoke", "photos-add", "com.veasnawt.vcut"]);
const output = resolve("apps/mobile/ios/App/output");
mkdirSync(output, { recursive: true });
const result = resolve(output, `Tests-${simulator}-${new Date().toISOString().replace(/[:.]/g, "-")}.xcresult`);
run("xcodebuild", [...args, "-resultBundlePath", result, "test-without-building"]);
console.log(`iOS test results: ${result}`);
