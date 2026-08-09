import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, COMMAND_SANDBOX_ROOT, resolveWithinBoundary } from "./sandboxedFs";

const IS_WINDOWS = process.platform === "win32";

/** Best-effort — NOT the same guarantee resolveWithinBoundary gives the file tools. Those validate
 *  one concrete path before ever touching the filesystem; a shell command is an opaque string that
 *  can reference paths ANYWHERE inside itself ("cd ..", an absolute path) — there's no way to parse
 *  arbitrary shell syntax and validate every path it might touch without actually implementing a
 *  real shell parser. This catches the common/obvious escape shapes (a ".." segment, a
 *  drive-absolute path outside both allowed roots) — good enough to stop an accidental or naively-
 *  injected escape, not a guarantee against a deliberately adversarial one. Real containment would
 *  need an OS-level sandbox (a restricted token, a container, Windows Sandbox) — out of scope for
 *  what a chat tool run from inside a Next.js API route can provide. */
function findEscapeAttempt(command: string): string | null {
  if (/\.\.[\\/]/.test(command)) return "it references a '..' path segment";
  if (IS_WINDOWS) {
    const driveAbsoluteMatches = command.match(/[a-zA-Z]:[\\/][^\s"']*/g) || [];
    const allowedRoots = [path.resolve(ROOT).toLowerCase(), path.resolve(COMMAND_SANDBOX_ROOT).toLowerCase()];
    for (const candidate of driveAbsoluteMatches) {
      const resolvedLower = path.resolve(candidate).toLowerCase();
      if (!allowedRoots.some((r) => resolvedLower.startsWith(r))) {
        return `it references an absolute path outside the sandbox ("${candidate}")`;
      }
    }
  }
  return null;
}

function buildSpawnArgs(command: string): { shell: string; args: string[] } {
  if (IS_WINDOWS) {
    const comspec = process.env.ComSpec || "cmd.exe";
    // Force UTF-8 console output codepage — matches the real Terminal studio's own spawn logic
    // (app/api/terminal/route.ts) so command output round-trips correctly for non-ASCII text.
    return { shell: comspec, args: ["/d", "/s", "/c", `chcp 65001>nul & ${command}`] };
  }
  return { shell: process.env.SHELL || "/bin/sh", args: ["-c", command] };
}

export interface SandboxedExecResult {
  status: "success" | "error";
  cwd: string;
  stdout: string;
  stderr: string;
  error?: string;
}

/** Resolves the requested cwd against one of exactly two allowed roots — never anything else, and
 *  in particular never the raw folder .desktop happens to live inside (which in dev mode is the
 *  whole monorepo, see sandboxedFs.ts's WORKSPACE_PARENT comment for why that distinction matters):
 *  - a path starting with ".desktop" resolves inside ROOT (the real Desktop workspace)
 *  - anything else resolves inside COMMAND_SANDBOX_ROOT (a dedicated, always-empty-by-default
 *    sibling folder — this is what "siblings of .desktop" for command execution actually means) */
function resolveCommandCwd(relCwd: string): string {
  const cleaned = (relCwd || "").trim().replace(/^[/\\]+/, "");
  if (cleaned === ".desktop" || cleaned.startsWith(".desktop/") || cleaned.startsWith(".desktop\\")) {
    const rest = cleaned.slice(".desktop".length).replace(/^[/\\]+/, "");
    return resolveWithinBoundary(ROOT, rest);
  }
  return resolveWithinBoundary(COMMAND_SANDBOX_ROOT, cleaned);
}

/** Runs a real shell command, cwd-locked to one of the two roots resolveCommandCwd allows, and
 *  screened against the obvious escape shapes findEscapeAttempt catches. 30s timeout: long enough
 *  for a normal command, short enough that a hung/interactive one doesn't stall the whole chat turn
 *  indefinitely. */
export async function runSandboxedCommand(command: string, relCwd: string): Promise<SandboxedExecResult> {
  const escapeReason = findEscapeAttempt(command);
  if (escapeReason) {
    return { status: "error", cwd: relCwd, stdout: "", stderr: "", error: `Refused — ${escapeReason}.` };
  }

  let absCwd: string;
  try {
    absCwd = resolveCommandCwd(relCwd);
  } catch (err) {
    return { status: "error", cwd: relCwd, stdout: "", stderr: "", error: err instanceof Error ? err.message : String(err) };
  }
  await fs.promises.mkdir(absCwd, { recursive: true }).catch(() => {});

  return new Promise((resolve) => {
    const { shell, args } = buildSpawnArgs(command);
    const child = spawn(shell, args, { cwd: absCwd, timeout: 30_000 });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("close", (code) => {
      resolve({
        status: code === 0 ? "success" : "error",
        cwd: relCwd,
        stdout: stdout.slice(0, 6000),
        stderr: stderr.slice(0, 2000),
        error: code !== 0 ? `Exited with code ${code}` : undefined,
      });
    });
    child.on("error", (err) => {
      resolve({ status: "error", cwd: relCwd, stdout, stderr, error: err.message });
    });
  });
}
