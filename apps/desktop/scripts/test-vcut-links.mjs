import { build } from "esbuild";
import electron from "electron";
import { spawn } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = realpathSync(tmpdir());
const temporary = mkdtempSync(path.join(temporaryRoot, "veasna-vcut-links-"));
try {
  const outfile = path.join(temporary, "smoke.cjs");
  await build({
    stdin: { contents: `import("${path.join(desktop, "tests/vcutGuestLinks.smoke.ts").replaceAll("\\", "/")}")`, resolveDir: desktop },
    bundle: true, platform: "node", format: "cjs", target: "node20", external: ["electron"], outfile,
  });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [outfile], { cwd: temporary, env, stdio: "inherit", windowsHide: true });
  process.exitCode = await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", code => resolve(code ?? 1)); });
} finally {
  const resolved = realpathSync(temporary);
  if (path.dirname(resolved) !== temporaryRoot || !path.basename(resolved).startsWith("veasna-vcut-links-")) throw new Error("Unexpected temporary path");
  rmSync(resolved, { recursive: true, force: true });
}
