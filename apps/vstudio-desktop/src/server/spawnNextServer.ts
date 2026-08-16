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

/** Forks the bundled standalone VStudio Next.js server under Electron's own Node runtime (no
 *  system Node required on the end user's machine), bound to a free loopback port. Returns the
 *  server's URL once it's actually responding, plus a `stop()` that resolves once the process has
 *  ACTUALLY exited (not just once a kill signal was sent) — call on app quit. `child.kill()` alone
 *  is fire-and-forget; a 3s timeout guards against a process that never exits cleanly, so quitting
 *  can't hang forever either. Mirrors apps/desktop's own spawnNextServer.ts (which forks several
 *  studios) minus the multi-resource plumbing — there is only ever one server here. */
export async function spawnNextServer(extraEnv: Record<string, string>): Promise<{ url: string; stop: () => Promise<void> }> {
  const serverJsPath = resolveServerJsPath(process.resourcesPath);
  if (!fs.existsSync(serverJsPath)) {
    throw new Error(`Bundled VStudio server not found at "${serverJsPath}" — did "pnpm package" run?`);
  }

  // Same port VStudio's own `pnpm dev` uses — see pickFreePort.ts's comment for why a stable port
  // matters even for a single-window app (nothing here relies on localStorage today, but there's
  // no reason to invite the question).
  const port = await pickFreePort(3002);
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

  child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(`[vstudio] ${chunk}`));
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[vstudio] ${chunk}`));

  const url = `http://127.0.0.1:${port}`;
  await waitForServerReady(url);

  const stop = () =>
    new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      child.kill();
    });

  return { url, stop };
}
