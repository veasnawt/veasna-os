import { utilityProcess } from "electron";
import type { UtilityProcess } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pickFreePort } from "./pickFreePort";
import { resolveServerJsPath } from "./resolveServerPaths";

function waitForServerReady(url: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      fetch(url)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() > deadline) {
            reject(new Error(`Server did not become ready within ${timeoutMs}ms`));
            return;
          }
          setTimeout(attempt, 250);
        });
    };
    attempt();
  });
}

export interface SpawnNextServerOptions {
  /** Matches the `outName` used in build-resources.mjs — "universe" or "bp". */
  resourceName: string;
  /** Prefixes this server's stdout/stderr lines in the main process console, e.g. "[universe]". */
  logLabel: string;
  /** Tried first before falling back to an OS-assigned free port — see pickFreePort.ts's comment
   *  for why a STABLE port matters here: it's the browser origin every `localStorage`-backed
   *  setting is scoped to, so a random port every launch silently wiped all of it on restart. */
  preferredPort: number;
  /** Extra env vars to set on the forked process, beyond PORT/HOSTNAME (which this function always
   *  sets itself). Used for e.g. VEASNA_WORKSPACE_ROOT (universe) or RIXIE_MEMORY_DB/API keys (bp)
   *  — deliberately passed in by the caller rather than hardcoded here, so this module stays
   *  app-agnostic and never has to know which app needs which secret/path. */
  extraEnv?: Record<string, string>;
}

/** Forks a bundled standalone Next.js server (universe or bp) under Electron's own Node runtime
 *  (no system Node required on the end user's machine), bound to a free loopback port. Returns the
 *  server's URL once it's actually responding, plus a `stop()` to kill it (call on app quit — an
 *  un-stopped fork outlives the Electron app otherwise). */
export async function spawnNextServer({ resourceName, logLabel, preferredPort, extraEnv }: SpawnNextServerOptions): Promise<{ url: string; stop: () => void }> {
  const serverJsPath = resolveServerJsPath(process.resourcesPath, resourceName);
  if (!fs.existsSync(serverJsPath)) {
    throw new Error(`Bundled "${resourceName}" server not found at "${serverJsPath}" — did the build:desktop pipeline run?`);
  }

  const port = await pickFreePort(preferredPort);
  const child: UtilityProcess = utilityProcess.fork(serverJsPath, [], {
    cwd: path.dirname(serverJsPath),
    stdio: "pipe",
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      ...extraEnv,
    },
  });

  child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(`${logLabel} ${chunk}`));
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`${logLabel} ${chunk}`));

  const url = `http://127.0.0.1:${port}`;
  await waitForServerReady(url);

  return { url, stop: () => child.kill() };
}
