import fs from "fs";
import path from "path";

// studios/universe/app/api/_lib -> up to veasna-os -> .desktop (gitignored, created lazily below).
// Always computed from process.cwd() at runtime — never a hardcoded machine path, so this
// resolves correctly regardless of where the repo lives on disk. In the packaged Electron desktop
// app there is no monorepo on disk at all, so apps/desktop sets VEASNA_WORKSPACE_ROOT to a real,
// writable, user-visible folder (Documents/Veasna OS) when it forks this server; unset in
// dev/pnpm-dev, where the process.cwd()-relative computation below still applies unchanged.
//
// NOT exported: confirmed the hard way why this can never be used as a sandbox boundary directly.
// In the packaged app it's a small, genuinely empty-besides-Veasna-OS folder (Documents/Veasna OS)
// — safe. In dev mode it's `../..` from studios/universe, which is the ENTIRE MONOREPO ROOT — a
// real desktop_run_command call with cwd="" and command="dir" proved this by listing node_modules,
// apps/, packages/, .claude/, everything. Anything meant to be a broader-than-.desktop sandbox
// boundary must use COMMAND_SANDBOX_ROOT below (its own dedicated, always-empty-by-default folder),
// never this raw value.
const WORKSPACE_PARENT = process.env.VEASNA_WORKSPACE_ROOT ?? path.resolve(process.cwd(), "../..");
export const ROOT = path.join(WORKSPACE_PARENT, ".desktop");
// A dedicated container for desktop_run_command — deliberately its OWN empty-by-default folder,
// not "whatever folder .desktop happens to live in" (see above). Lives alongside .desktop as a
// genuine sibling, satisfying "siblings of .desktop" without ever exposing the real dev-mode
// monorepo or the packaged app's own rixie.env/rixie-memory.db (which sit in WORKSPACE_PARENT too,
// but are never inside this folder unless something explicitly copies them here).
export const COMMAND_SANDBOX_ROOT = path.join(WORKSPACE_PARENT, ".veasna-workspace");

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function ensureRoot() {
  fs.mkdirSync(ROOT, { recursive: true });
}

export function validateName(name: string) {
  if (!name || /[/\\]/.test(name) || name === "." || name === "..") {
    throw new ApiError(400, "Invalid name", "invalid-name");
  }
}

/** Resolves a client-supplied relative path against an arbitrary boundary directory and
 *  guarantees the result never escapes it — rejects ".." segments outright, then double-checks via
 *  prefix comparison after resolving (catches absolute paths, UNC paths, and any other escape
 *  shape). The one real boundary-enforcement primitive in this codebase — every sandbox (Desktop's
 *  ROOT, desktop_run_command's COMMAND_SANDBOX_ROOT) resolves through this, never a reimplementation
 *  of the same check. */
export function resolveWithinBoundary(boundary: string, relPath: string): string {
  const cleaned = (relPath || "").replace(/^[/\\]+/, "");
  if (cleaned.split(/[/\\]/).includes("..")) {
    throw new ApiError(400, "Path escapes the sandboxed root", "sandbox-violation");
  }
  const resolved = path.resolve(boundary, cleaned);
  const boundaryWithSep = boundary.endsWith(path.sep) ? boundary : boundary + path.sep;
  if (resolved !== boundary && !resolved.startsWith(boundaryWithSep)) {
    throw new ApiError(400, "Path escapes the sandboxed root", "sandbox-violation");
  }
  return resolved;
}

/** Resolves a client-supplied relative path against ROOT (the Desktop workspace specifically) —
 *  what every existing file/folder route already uses. */
export function resolveSandboxed(relPath: string): string {
  return resolveWithinBoundary(ROOT, relPath);
}

export function toRelPath(absPath: string): string {
  return path.relative(ROOT, absPath).split(path.sep).join("/");
}

export async function pathExists(absPath: string): Promise<boolean> {
  return fs.promises
    .access(absPath)
    .then(() => true)
    .catch(() => false);
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
}
