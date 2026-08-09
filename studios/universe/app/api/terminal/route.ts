import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs";
import path from "path";
import { isLocalRequest, localOnlyResponse } from "../_lib/localOnlyGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Monorepo root — studios/universe/app/api/terminal -> up to veasna-os/. In the packaged Electron
// desktop app there is no monorepo on disk at all, so apps/desktop sets VEASNA_WORKSPACE_ROOT to a
// real, writable, user-visible folder (Documents/Veasna OS) when it forks this server; unset in
// dev/pnpm-dev, where the process.cwd()-relative computation below still applies unchanged.
const WORKSPACE_ROOT = process.env.VEASNA_WORKSPACE_ROOT ?? path.resolve(process.cwd(), "../..");

const IS_WINDOWS = process.platform === "win32";

/** Picks the real shell binary + argv for the current OS. `cmd.exe` and its `/d /s /c` flags are
 *  Windows-only syntax; POSIX shells (`sh`, `bash`, `zsh`, ...) take a command string via `-c`
 *  instead. `$SHELL` is the standard way a Unix process learns the user's preferred shell — `/bin/sh`
 *  is the POSIX-guaranteed fallback if it's unset (e.g. this process wasn't launched from a real
 *  interactive shell). */
function buildSpawnArgs(command: string): { shell: string; args: string[] } {
  if (IS_WINDOWS) {
    const comspec = process.env.ComSpec || "cmd.exe";
    // Force UTF-8 console output codepage so non-ASCII text round-trips correctly — cmd.exe
    // defaults to a legacy codepage otherwise. POSIX shells don't need this; they're UTF-8 already.
    return { shell: comspec, args: ["/d", "/s", "/c", `chcp 65001>nul & ${command}`] };
  }
  return { shell: process.env.SHELL || "/bin/sh", args: ["-c", command] };
}

interface TerminalSession {
  cwd: string;
  currentProc: ChildProcessWithoutNullStreams | null;
}

// Module-level: survives across requests within this dev server process (resets on restart, which is fine).
const sessions = new Map<string, TerminalSession>();

const META_MARKER = "@@VEASNA_TERMINAL_META@@";

function getSession(sessionId: string): TerminalSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { cwd: WORKSPACE_ROOT, currentProc: null };
    sessions.set(sessionId, session);
  }
  return session;
}

function metaChunk(cwd: string, exitCode: number | null) {
  return META_MARKER + JSON.stringify({ cwd, exitCode });
}

function resolveCdTarget(cwd: string, arg: string): string {
  const cleaned = arg.trim().replace(/^"(.*)"$/, "$1");
  if (!cleaned || cleaned === "~") return WORKSPACE_ROOT;
  return path.resolve(cwd, cleaned);
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) return localOnlyResponse();
  const body = await req.json().catch(() => null);
  if (!body || typeof body.sessionId !== "string") {
    return new Response("Bad request", { status: 400 });
  }

  const session = getSession(body.sessionId);

  if (body.action === "kill") {
    session.currentProc?.kill();
    return Response.json({ ok: true });
  }

  if (body.action === "cwd") {
    return Response.json({ cwd: session.cwd });
  }

  if (body.action !== "exec" || typeof body.command !== "string") {
    return new Response("Bad request", { status: 400 });
  }

  const command = body.command.trim();

  if (session.currentProc) {
    return new Response("A command is already running in this terminal.\n" + metaChunk(session.cwd, null), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (!command) {
    return new Response(metaChunk(session.cwd, 0), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // `cd` is intercepted rather than spawned — a child process's working directory
  // change can't propagate back to the parent, so the shell "session" tracks cwd itself.
  const cdMatch = command.match(/^cd(\s+(.*))?$/i);
  if (cdMatch) {
    const arg = cdMatch[2];
    if (!arg) {
      return new Response(session.cwd + "\n" + metaChunk(session.cwd, 0), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    const target = resolveCdTarget(session.cwd, arg);
    try {
      const stat = fs.statSync(target);
      if (!stat.isDirectory()) throw new Error("not a directory");
      session.cwd = target;
      return new Response(metaChunk(session.cwd, 0), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    } catch {
      // Matches each OS's own familiar phrasing for this — cosmetic, but a real shell on either
      // platform would say roughly this, and `cd` here is intercepted rather than actually spawned
      // (see the comment above), so nothing else produces this message for us.
      const notFoundMessage = IS_WINDOWS ? "The system cannot find the path specified." : "No such file or directory";
      return new Response(notFoundMessage + "\n" + metaChunk(session.cwd, 1), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }

  const { shell, args } = buildSpawnArgs(command);
  const child = spawn(shell, args, {
    cwd: session.cwd,
    // Windows-only option — Node ignores it on other platforms, but keeping it scoped to the
    // Windows branch makes the intent explicit rather than relying on that silent cross-platform no-op.
    ...(IS_WINDOWS ? { windowsHide: true } : {}),
  });
  session.currentProc = child;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      child.stdout.on("data", (chunk: Buffer) => controller.enqueue(encoder.encode(chunk.toString("utf8"))));
      child.stderr.on("data", (chunk: Buffer) => controller.enqueue(encoder.encode(chunk.toString("utf8"))));
      child.on("error", (err) => {
        controller.enqueue(encoder.encode(`\n${err.message}\n`));
      });
      child.on("close", (code) => {
        session.currentProc = null;
        controller.enqueue(encoder.encode(metaChunk(session.cwd, code)));
        controller.close();
      });
    },
    cancel() {
      child.kill();
      session.currentProc = null;
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
