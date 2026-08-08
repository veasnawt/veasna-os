import fs from "fs";
import path from "path";
import { isLocalRequest, localOnlyResponse } from "../_lib/localOnlyGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// studios/universe/app/api/files -> up to veasna-os -> .desktop (gitignored, created lazily below).
// Always computed from process.cwd() at runtime — never a hardcoded machine path, so this
// resolves correctly regardless of where the repo lives on disk.
const ROOT = path.resolve(process.cwd(), "../..", ".desktop");

class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function ensureRoot() {
  fs.mkdirSync(ROOT, { recursive: true });
}

/** Resolves a client-supplied relative path against ROOT and guarantees the result never
 *  escapes it — rejects ".." segments outright, then double-checks via prefix comparison
 *  after resolving (catches absolute paths, UNC paths, and any other escape shape). */
function resolveSandboxed(relPath: string): string {
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

function toRelPath(absPath: string): string {
  return path.relative(ROOT, absPath).split(path.sep).join("/");
}

function validateName(name: string) {
  if (!name || /[/\\]/.test(name) || name === "." || name === "..") {
    throw new ApiError(400, "Invalid name", "invalid-name");
  }
}

async function pathExists(absPath: string): Promise<boolean> {
  return fs.promises
    .access(absPath)
    .then(() => true)
    .catch(() => false);
}

async function listEntries(relPath: string) {
  const target = resolveSandboxed(relPath);
  const stat = await fs.promises.stat(target).catch(() => null);
  if (!stat) throw new ApiError(404, "Folder not found");
  if (!stat.isDirectory()) throw new ApiError(400, "Not a folder");
  const dirents = await fs.promises.readdir(target, { withFileTypes: true });
  // Dirent.isDirectory()/isFile() are false for symlinks — this incidentally keeps any
  // manually-placed symlink out of listings rather than following it outside the sandbox.
  return dirents
    .filter((d) => d.isDirectory() || d.isFile())
    .map((d) => ({
      name: d.name,
      kind: (d.isDirectory() ? "folder" : "file") as "folder" | "file",
      path: relPath ? `${relPath}/${d.name}` : d.name,
    }));
}

/** Recursively walks the sandbox for name matches — used by the global search overlay ("search
 *  anything in the OS"), so unlike `listEntries` this isn't scoped to one folder. Both a result cap
 *  and a node-visit budget bound the walk so a pathologically large tree can't hang the request; a
 *  personal desktop tree is expected to be small enough that neither limit is ever actually hit. */
async function searchEntries(query: string, limit = 50) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: { name: string; kind: "folder" | "file"; path: string }[] = [];
  let visited = 0;
  const MAX_VISITED = 5000;

  async function walk(dirAbs: string, dirRel: string) {
    if (results.length >= limit || visited >= MAX_VISITED) return;
    let dirents: fs.Dirent[];
    try {
      dirents = await fs.promises.readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      if (results.length >= limit || visited >= MAX_VISITED) return;
      visited++;
      if (!d.isDirectory() && !d.isFile()) continue;
      const rel = dirRel ? `${dirRel}/${d.name}` : d.name;
      if (d.name.toLowerCase().includes(q)) {
        results.push({ name: d.name, kind: d.isDirectory() ? "folder" : "file", path: rel });
      }
      if (d.isDirectory()) {
        await walk(path.join(dirAbs, d.name), rel);
      }
    }
  }

  await walk(ROOT, "");
  return results;
}

async function readFileContent(relPath: string) {
  const abs = resolveSandboxed(relPath);
  const stat = await fs.promises.stat(abs).catch(() => null);
  if (!stat) throw new ApiError(404, "File not found");
  if (stat.isDirectory()) throw new ApiError(400, "Not a file");
  return fs.promises.readFile(abs, "utf8");
}

async function writeFileContent(relPath: string, content: string) {
  if (!relPath) throw new ApiError(400, "Cannot write to the root", "root-target");
  const abs = resolveSandboxed(relPath);
  const stat = await fs.promises.stat(abs).catch(() => null);
  if (stat && stat.isDirectory()) throw new ApiError(400, "Cannot write to a folder");
  await fs.promises.writeFile(abs, content, "utf8");
}

async function mkdir(parentRel: string, name: string) {
  validateName(name);
  const parentAbs = resolveSandboxed(parentRel);
  const targetAbs = path.join(parentAbs, name);
  try {
    await fs.promises.mkdir(targetAbs, { recursive: false });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") throw new ApiError(409, "Already exists", "exists");
    throw err;
  }
  return toRelPath(targetAbs);
}

async function createFile(parentRel: string, name: string) {
  validateName(name);
  const parentAbs = resolveSandboxed(parentRel);
  const targetAbs = path.join(parentAbs, name);
  try {
    await fs.promises.writeFile(targetAbs, "", { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") throw new ApiError(409, "Already exists", "exists");
    throw err;
  }
  return toRelPath(targetAbs);
}

async function renameEntry(relPath: string, newName: string) {
  if (!relPath) throw new ApiError(400, "Cannot rename the root", "root-target");
  validateName(newName);
  const oldAbs = resolveSandboxed(relPath);
  const newAbs = path.join(path.dirname(oldAbs), newName);
  // Filesystems here are case-insensitive (Windows/NTFS), so "renaming" to the same name — or only
  // changing its case — must not be treated as colliding with itself. Confirming the new name against
  // the OLD name (not a fresh directory listing) is what actually distinguishes "same item" from
  // "a different item that happens to already have this name".
  const isSameOrCaseChange = path.basename(oldAbs).toLowerCase() === newName.toLowerCase();
  if (!isSameOrCaseChange && (await pathExists(newAbs))) {
    throw new ApiError(409, "Already exists", "exists");
  }
  if (newAbs === oldAbs) return toRelPath(oldAbs);
  await fs.promises.rename(oldAbs, newAbs);
  return toRelPath(newAbs);
}

async function moveEntry(relPath: string, targetFolderRel: string) {
  if (!relPath) throw new ApiError(400, "Cannot move the root", "root-target");
  const srcAbs = resolveSandboxed(relPath);
  const targetFolderAbs = resolveSandboxed(targetFolderRel);
  const srcWithSep = srcAbs.endsWith(path.sep) ? srcAbs : srcAbs + path.sep;
  if (targetFolderAbs === srcAbs || targetFolderAbs.startsWith(srcWithSep)) {
    throw new ApiError(400, "Cannot move a folder into itself or a descendant", "cyclic-move");
  }
  const targetStat = await fs.promises.stat(targetFolderAbs).catch(() => null);
  if (!targetStat || !targetStat.isDirectory()) throw new ApiError(404, "Target folder not found");
  const destAbs = path.join(targetFolderAbs, path.basename(srcAbs));
  if (destAbs !== srcAbs && (await pathExists(destAbs))) {
    throw new ApiError(409, "Already exists at destination", "exists");
  }
  if (destAbs === srcAbs) return toRelPath(destAbs);
  await fs.promises.rename(srcAbs, destAbs);
  return toRelPath(destAbs);
}

async function copyEntry(relPath: string, targetFolderRel: string, name?: string) {
  if (!relPath) throw new ApiError(400, "Cannot copy the root", "root-target");
  const srcAbs = resolveSandboxed(relPath);
  const targetFolderAbs = resolveSandboxed(targetFolderRel);
  const srcWithSep = srcAbs.endsWith(path.sep) ? srcAbs : srcAbs + path.sep;
  if (targetFolderAbs === srcAbs || targetFolderAbs.startsWith(srcWithSep)) {
    throw new ApiError(400, "Cannot copy a folder into itself or a descendant", "cyclic-move");
  }
  const targetStat = await fs.promises.stat(targetFolderAbs).catch(() => null);
  if (!targetStat || !targetStat.isDirectory()) throw new ApiError(404, "Target folder not found");
  const finalName = name || path.basename(srcAbs);
  validateName(finalName);
  const destAbs = path.join(targetFolderAbs, finalName);
  if (destAbs === srcAbs || (await pathExists(destAbs))) {
    throw new ApiError(409, "Already exists at destination", "exists");
  }
  await fs.promises.cp(srcAbs, destAbs, { recursive: true, errorOnExist: true });
  return toRelPath(destAbs);
}

async function deleteEntries(paths: string[]) {
  const deleted: string[] = [];
  const errors: { path: string; message: string }[] = [];
  for (const p of paths) {
    try {
      if (!p) throw new ApiError(400, "Cannot delete the root", "root-target");
      const abs = resolveSandboxed(p);
      await fs.promises.rm(abs, { recursive: true, force: false });
      deleted.push(p);
    } catch (err) {
      // Already gone (e.g. deleted a moment ago by a duplicate request, another tab, or a desynced
      // client) — that's the caller's desired end state, not a real failure, so treat it as success
      // rather than surfacing a scary "ENOENT" error for something that's already true.
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
        deleted.push(p);
        continue;
      }
      errors.push({ path: p, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { deleted, errors };
}

function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
}

export async function GET(req: Request) {
  if (!isLocalRequest(req)) return localOnlyResponse();
  ensureRoot();
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const relPath = url.searchParams.get("path") ?? "";
  try {
    if (action === "list") return Response.json({ entries: await listEntries(relPath) });
    if (action === "readFile") return Response.json({ content: await readFileContent(relPath) });
    if (action === "search") return Response.json({ entries: await searchEntries(url.searchParams.get("q") ?? "") });
    throw new ApiError(400, "Unknown action");
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) return localOnlyResponse();
  ensureRoot();
  const body = await req.json().catch(() => null);
  if (!body || typeof body.action !== "string") return errorResponse(new ApiError(400, "Bad request"));
  try {
    switch (body.action) {
      case "mkdir":
        return Response.json({ path: await mkdir(String(body.path ?? ""), String(body.name ?? "")) });
      case "createFile":
        return Response.json({ path: await createFile(String(body.path ?? ""), String(body.name ?? "")) });
      case "rename":
        return Response.json({ path: await renameEntry(String(body.path ?? ""), String(body.newName ?? "")) });
      case "move":
        return Response.json({
          path: await moveEntry(String(body.path ?? ""), String(body.targetFolderPath ?? "")),
        });
      case "copy":
        return Response.json({
          path: await copyEntry(
            String(body.path ?? ""),
            String(body.targetFolderPath ?? ""),
            body.name ? String(body.name) : undefined
          ),
        });
      case "delete":
        if (!Array.isArray(body.paths)) throw new ApiError(400, "paths must be an array");
        return Response.json(await deleteEntries(body.paths.map(String)));
      case "writeFile":
        await writeFileContent(String(body.path ?? ""), String(body.content ?? ""));
        return Response.json({ ok: true });
      default:
        throw new ApiError(400, "Unknown action");
    }
  } catch (err) {
    return errorResponse(err);
  }
}
