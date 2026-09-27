// Package the already-built Windows application for its Partner Center identity.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = ["VCUT_STORE_IDENTITY", "VCUT_STORE_PUBLISHER", "VCUT_STORE_PUBLISHER_NAME"];
const missing = required.filter(key => !process.env[key]);
if (missing.length) { console.error("Copy these values from Partner Center before packaging: " + missing.join(", ")); process.exit(1); }
const desktop = path.join(root, "apps/vcut-desktop");
mkdirSync(path.join(desktop, "release-store"), { recursive: true });
// JSON is passed as data; publisher values are never interpolated into shell commands.
const config = {
  extends: "electron-builder.yml", directories: { output: "release-store" },
  win: { target: [{ target: "appx", arch: ["x64"] }] },
  appx: { identityName: process.env.VCUT_STORE_IDENTITY, publisher: process.env.VCUT_STORE_PUBLISHER,
    publisherDisplayName: process.env.VCUT_STORE_PUBLISHER_NAME, displayName: "VCut", applicationId: "VCut",
    backgroundColor: "#0a0c10" }
};
const configPath = path.join(desktop, "release-store/store-config.json");
writeFileSync(configPath, JSON.stringify(config, null, 2));
const result = spawnSync("pnpm", ["exec", "electron-builder", "--config", "release-store/store-config.json", "--win", "appx", "--x64"], { cwd: desktop, stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
