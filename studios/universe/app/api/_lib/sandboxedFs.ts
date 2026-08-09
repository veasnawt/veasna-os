import fs from "fs";
import path from "path";

// studios/universe/app/api/_lib -> up to veasna-os -> .desktop (gitignored, created lazily below).
// Always computed from process.cwd() at runtime — never a hardcoded machine path, so this
// resolves correctly regardless of where the repo lives on disk. In the packaged Electron desktop
// app there is no monorepo on disk at all, so apps/desktop sets VEASNA_WORKSPACE_ROOT to a real,
// writable, user-visible folder (Documents/Veasna OS) when it forks this server; unset in
// dev/pnpm-dev, where the process.cwd()-relative computation below still applies unchanged.
export const ROOT = path.join(process.env.VEASNA_WORKSPACE_ROOT ?? path.resolve(process.cwd(), "../.."), ".desktop");

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

/** Resolves a client-supplied relative path against ROOT and guarantees the result never
 *  escapes it — rejects ".." segments outright, then double-checks via prefix comparison
 *  after resolving (catches absolute paths, UNC paths, and any other escape shape). Shared by
 *  every route that touches the real filesystem — this boundary must never be duplicated, only
 *  ever imported, so a fix here can't accidentally miss one of the routes using it. */
export function resolveSandboxed(relPath: string): string {
  const cleaned = (relPath || "").replace(/^[/\\]+/, "");
  if (cleaned.split(/[/\\]/).includes("..")) {
    throw new ApiError(400, "Path escapes the sandboxed root", "sandbox-violation");
  }
  const resolved = path.resolve(ROOT, cleaned);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (resolved !== ROOT && !resolved.startsWith(rootWithSep)) {
    throw new ApiError(400, "Path escapes the sandboxed root", "sandbox-violation");
  }
  return resolved;
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
