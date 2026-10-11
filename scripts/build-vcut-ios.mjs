import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
if (process.platform !== "darwin") throw new Error("iOS builds require macOS and Xcode.");
const project = readFileSync("apps/mobile/ios/App/App.xcodeproj/project.pbxproj", "utf8");
const version = project.match(/MARKETING_VERSION = ([\d.]+);/)?.[1];
const build = process.env.VCUT_IOS_BUILD_NUMBER || project.match(/CURRENT_PROJECT_VERSION = (\d+);/)?.[1];
const mobile = JSON.parse(readFileSync("apps/mobile/package.json", "utf8"));
if (version !== mobile.version) throw new Error("Align the iOS marketing version with apps/mobile/package.json before building.");
if (!/^\d+$/.test(build || "")) throw new Error("A numeric VCUT_IOS_BUILD_NUMBER is required.");
const output = resolve("apps/mobile/ios/App/output");
const archive = resolve(output, `VCut-${version}-${build}.xcarchive`);
const ipa = resolve(output, `VCut-${version}-${build}`);
const exportOnly = process.argv.includes("--export-only");
const archiveMetadata = resolve(archive, "vcut-build-info.json");
if (!exportOnly && existsSync(archive)) throw new Error(`Build ${version} (${build}) already exists. Use a new VCUT_IOS_BUILD_NUMBER or --export-only.`);
if (exportOnly && !existsSync(archive)) throw new Error("No archive exists for this build.");
if (existsSync(resolve(ipa, "App.ipa"))) throw new Error("An exported IPA already exists for this build.");
mkdirSync(output, { recursive: true });
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`);
}
function sourceInfo() {
  const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim();
  const sharedGit = spawnSync("git", ["-C", "packages/vcut", "rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim();
  const dirty = Boolean(spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" }).stdout?.trim());
  // Record the actual inputs, including uncommitted and new source files in submodules.
  const sourceHash = createHash("sha256");
  for (const cwd of [".", "packages/vcut", "packages/vicons", "packages/auth"]) {
    const listing = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd, encoding: "utf8" });
    if (listing.status !== 0) throw new Error(`Couldn't inventory sources in ${cwd}`);
    for (const file of [...new Set(listing.stdout.split("\0").filter(Boolean))].sort()) {
      if (cwd === "." && !/^(apps\/mobile\/|scripts\/|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$)/.test(file)) continue;
      const path = resolve(cwd, file);
      sourceHash.update(`${cwd}/${file}\0`);
      if (!existsSync(path)) sourceHash.update("deleted\0");
      else if (statSync(path).isFile()) sourceHash.update(readFileSync(path));
    }
  }
  return { version, build, git, sharedGit, dirty, sourceSha256: sourceHash.digest("hex"), archive, archivedAt: new Date().toISOString() };
}
if (!exportOnly) {
  run("pnpm", ["--filter", "@veasnawt/vicons", "build"]);
  run("pnpm", ["--filter", "vcut-mobile", "build"]);
  // CocoaPods does not run prepare_command for local :path pods on a fresh checkout.
  run("bash", ["setup_ios.sh"], resolve("apps/mobile/ios/App/FFmpegKitLGPL"));
  run("pnpm", ["--filter", "vcut-mobile", "exec", "cap", "sync", "ios"]);
  const metadata = sourceInfo();
  run("xcodebuild", ["-workspace", "apps/mobile/ios/App/App.xcworkspace", "-scheme", "App", "-configuration", "Release",
    "-destination", "generic/platform=iOS", "-derivedDataPath", "apps/mobile/ios/DerivedData-release",
    "-archivePath", archive, `CURRENT_PROJECT_VERSION=${build}`, "archive"]);
  writeFileSync(archiveMetadata, JSON.stringify(metadata, null, 2) + "\n");
}
// Export to disk only. Upload and tester distribution happen separately in App Store Connect.
const options = resolve("apps/mobile/ios/ExportOptions.plist");
run("xcodebuild", ["-exportArchive", "-archivePath", archive, "-exportPath", ipa, "-exportOptionsPlist", options]);
// Resumed export keeps the archive's provenance even if the working tree has changed.
const metadata = existsSync(archiveMetadata) ? JSON.parse(readFileSync(archiveMetadata, "utf8"))
  : { version, build, archive, sourceMetadataUnavailable: true };
writeFileSync(resolve(ipa, "build-info.json"), JSON.stringify({ ...metadata, exportedAt: new Date().toISOString() }, null, 2) + "\n");
const app = resolve(archive, "Products/Applications/App.app");
run("codesign", ["--verify", "--deep", "--strict", app]);
const archiveCdHash = spawnSync("codesign", ["-d", "--verbose=4", app], { encoding: "utf8" }).stderr.match(/^CDHash=([a-f0-9]+)$/m)?.[1];
if (!archiveCdHash) throw new Error("Couldn't fingerprint the signed archive.");
const appInfo = JSON.parse(spawnSync("plutil", ["-convert", "json", "-o", "-", resolve(app, "Info.plist")], { encoding: "utf8" }).stdout);
if (appInfo.CFBundleIdentifier !== "com.veasnawt.vcut" || appInfo.CFBundleShortVersionString !== version || String(appInfo.CFBundleVersion) !== build) throw new Error("Archive version or bundle ID does not match the requested build.");
if (!existsSync(resolve(app, "PrivacyInfo.xcprivacy"))) throw new Error("Release privacy manifest is missing.");
if (existsSync(resolve(app, "AppTests.xctest"))) throw new Error("Release archive contains tests.");
const ipaBytes = readFileSync(resolve(ipa, "App.ipa"));
writeFileSync(resolve(ipa, "verification.json"), JSON.stringify({
  bundleId: appInfo.CFBundleIdentifier, version, build, sdk: appInfo.DTSDKName,
  minimumOS: appInfo.MinimumOSVersion, bytes: ipaBytes.length, archiveCdHash,
  sha256: createHash("sha256").update(ipaBytes).digest("hex"), verifiedAt: new Date().toISOString(),
}, null, 2) + "\n");
console.log(`Signed beta exported to ${ipa}`);
