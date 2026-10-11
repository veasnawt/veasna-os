import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("../", import.meta.url)));
if (process.platform !== "darwin") throw new Error("iOS uploads require macOS and Xcode.");
const build = process.env.VCUT_IOS_BUILD_NUMBER;
if (!/^\d+$/.test(build || "")) throw new Error("Set VCUT_IOS_BUILD_NUMBER to the verified build to upload.");
const version = JSON.parse(readFileSync("apps/mobile/package.json", "utf8")).version;
const folder = resolve(`apps/mobile/ios/App/output/VCut-${version}-${build}`);
const metadata = JSON.parse(readFileSync(resolve(folder, "build-info.json"), "utf8"));
const verification = JSON.parse(readFileSync(resolve(folder, "verification.json"), "utf8"));
const sha256 = createHash("sha256").update(readFileSync(resolve(folder, "App.ipa"))).digest("hex");
if (metadata.version !== version || metadata.build !== build || verification.sha256 !== sha256) throw new Error("Build metadata or IPA checksum does not match.");
if (!metadata.sourceSha256) throw new Error("Rebuild with source fingerprints before uploading.");
if (!existsSync(metadata.archive)) throw new Error("The verified archive is missing.");
const signature = spawnSync("codesign", ["--verify", "--deep", "--strict", resolve(metadata.archive, "Products/Applications/App.app")], { stdio: "inherit" });
if (signature.status !== 0) throw new Error("Archive signature verification failed.");
const archiveCdHash = spawnSync("codesign", ["-d", "--verbose=4", resolve(metadata.archive, "Products/Applications/App.app")], { encoding: "utf8" }).stderr.match(/^CDHash=([a-f0-9]+)$/m)?.[1];
if (!archiveCdHash || archiveCdHash !== verification.archiveCdHash) throw new Error("The archive differs from the verified release.");
const options = readFileSync("apps/mobile/ios/ExportOptions.plist", "utf8").replace(/(<key>destination<\/key>\s*<string>)export(<\/string>)/, "$1upload$2");
if (!options.includes("<string>upload</string>")) throw new Error("Couldn't configure upload destination.");
const optionsPath = resolve(folder, "UploadOptions.plist");
writeFileSync(optionsPath, options);
const args = ["-exportArchive", "-archivePath", metadata.archive, "-exportOptionsPlist", optionsPath, "-allowProvisioningUpdates"];
const keyPath = process.env.ASC_KEY_PATH, keyId = process.env.ASC_KEY_ID, issuer = process.env.ASC_ISSUER_ID;
if (keyPath || keyId || issuer) {
  if (!keyPath || !keyId || !issuer) throw new Error("API authentication needs ASC_KEY_PATH, ASC_KEY_ID, and ASC_ISSUER_ID together.");
  args.push("-authenticationKeyPath", keyPath, "-authenticationKeyID", keyId, "-authenticationKeyIssuerID", issuer);
}
const startedAt = new Date().toISOString();
const result = spawnSync("xcodebuild", args, { stdio: "inherit" });
writeFileSync(resolve(folder, "upload-result.json"), JSON.stringify({ version, build, sha256, startedAt, finishedAt: new Date().toISOString(), exitCode: result.status, uploaded: result.status === 0 }, null, 2) + "\n");
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Upload failed (${result.status}). Check Xcode account access or configure an App Store Connect API key.`);
console.log(`Uploaded VCut ${version} (${build}). Apple processing and TestFlight availability must be checked in App Store Connect.`);
