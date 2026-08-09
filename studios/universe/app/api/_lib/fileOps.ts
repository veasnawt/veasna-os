import fs from "fs";
import path from "path";
import { ROOT, ApiError, resolveSandboxed, toRelPath, pathExists, validateName } from "./sandboxedFs";

// Deleting moves an item here instead of removing it outright, so Ctrl+Z can bring it back losslessly
// — a real filesystem `rm` can't be undone. Lives at the sandbox root, hidden from every listing/search
// below (a real trash bin's contents are never meant to show up as "just another folder").
export const TRASH_DIR = ".trash";

// Files attached to Rixie's chat (RixieWindow.tsx's paperclip button) land here instead of a
// visible "Rixie Uploads" folder on the Desktop — same hidden-from-every-listing treatment as
// TRASH_DIR, for the same reason: these aren't files the user consciously placed on their Desktop,
// they're chat attachments that happen to live in the same sandbox so Rixie's existing
// desktop_read_file tool can reach them with no extra plumbing.
export const RIXIE_UPLOADS_DIR = ".rixie-uploads";

export interface FileEntry {
  name: string;
  kind: "folder" | "file";
  path: string;
}

export async function listEntries(relPath: string): Promise<FileEntry[]> {
  const target = resolveSandboxed(relPath);
  const stat = await fs.promises.stat(target).catch(() => null);
  if (!stat) throw new ApiError(404, "Folder not found");
  if (!stat.isDirectory()) throw new ApiError(400, "Not a folder");
  const dirents = await fs.promises.readdir(target, { withFileTypes: true });
  // Dirent.isDirectory()/isFile() are false for symlinks — this incidentally keeps any
  // manually-placed symlink out of listings rather than following it outside the sandbox.
  return dirents
    .filter((d) => (d.isDirectory() || d.isFile()) && !(relPath === "" && (d.name === TRASH_DIR || d.name === RIXIE_UPLOADS_DIR)))
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
export async function searchEntries(query: string, limit = 50): Promise<FileEntry[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: FileEntry[] = [];
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
      if (dirRel === "" && (d.name === TRASH_DIR || d.name === RIXIE_UPLOADS_DIR)) continue;
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

/** Real Windows Properties for a folder sums the size of everything inside it, not the directory
 *  inode's own (meaningless) size — same node-visit budget as `searchEntries` so a pathologically
 *  large tree can't hang the request; a personal desktop tree is expected to stay well under it. */
async function folderSize(dirAbs: string, budget: { visited: number }): Promise<number> {
  const MAX_VISITED = 20000;
  if (budget.visited >= MAX_VISITED) return 0;
  let total = 0;
  let dirents: fs.Dirent[];
  try {
    dirents = await fs.promises.readdir(dirAbs, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const d of dirents) {
    if (budget.visited >= MAX_VISITED) break;
    budget.visited++;
    const abs = path.join(dirAbs, d.name);
    if (d.isDirectory()) {
      total += await folderSize(abs, budget);
    } else if (d.isFile()) {
      const s = await fs.promises.stat(abs).catch(() => null);
      if (s) total += s.size;
    }
  }
  return total;
}

export async function statEntry(relPath: string) {
  const abs = resolveSandboxed(relPath);
  const stat = await fs.promises.stat(abs).catch(() => null);
  if (!stat) throw new ApiError(404, "Not found");
  const kind: "folder" | "file" = stat.isDirectory() ? "folder" : "file";
  const size = kind === "folder" ? await folderSize(abs, { visited: 0 }) : stat.size;
  return {
    kind,
    size,
    mtime: stat.mtime.toISOString(),
    // Windows/NTFS birthtime is real creation time (unlike some Linux filesystems, where it's often
    // unreliable) — this app's target OS, so surfacing "Created" here is meaningful, not a guess.
    birthtime: stat.birthtime.toISOString(),
  };
}

export async function readFileContent(relPath: string): Promise<string> {
  const abs = resolveSandboxed(relPath);
  const stat = await fs.promises.stat(abs).catch(() => null);
  if (!stat) throw new ApiError(404, "File not found");
  if (stat.isDirectory()) throw new ApiError(400, "Not a file");
  return fs.promises.readFile(abs, "utf8");
}

export async function writeFileContent(relPath: string, content: string): Promise<void> {
  if (!relPath) throw new ApiError(400, "Cannot write to the root", "root-target");
  const abs = resolveSandboxed(relPath);
  const stat = await fs.promises.stat(abs).catch(() => null);
  if (stat && stat.isDirectory()) throw new ApiError(400, "Cannot write to a folder");
  await fs.promises.writeFile(abs, content, "utf8");
}

export async function mkdir(parentRel: string, name: string): Promise<string> {
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

export async function createFile(parentRel: string, name: string): Promise<string> {
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

export async function renameEntry(relPath: string, newName: string): Promise<string> {
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

export async function moveEntry(relPath: string, targetFolderRel: string): Promise<string> {
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

export async function copyEntry(relPath: string, targetFolderRel: string, name?: string): Promise<string> {
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

/** Soft-delete: moves each item into `.trash/<unique>-<name>` rather than removing it, so the
 *  caller can restore it losslessly (Ctrl+Z) — a real `fs.rm` can't be undone. The unique prefix
 *  avoids collisions between two different items that happened to share a name. */
export async function deleteEntries(paths: string[]) {
  const deleted: string[] = [];
  const trashed: { path: string; trashPath: string }[] = [];
  const errors: { path: string; message: string }[] = [];
  for (const p of paths) {
    try {
      if (!p) throw new ApiError(400, "Cannot delete the root", "root-target");
      if (p === TRASH_DIR || p.startsWith(`${TRASH_DIR}/`)) {
        throw new ApiError(400, "Cannot delete the trash itself", "trash-target");
      }
      if (p === RIXIE_UPLOADS_DIR) {
        throw new ApiError(400, "Cannot delete the Rixie uploads folder itself", "rixie-uploads-target");
      }
      const abs = resolveSandboxed(p);
      const stat = await fs.promises.stat(abs).catch(() => null);
      if (!stat) {
        // Already gone (e.g. deleted a moment ago by a duplicate request, another tab, or a desynced
        // client) — that's the caller's desired end state, not a real failure.
        deleted.push(p);
        continue;
      }
      const trashRel = `${TRASH_DIR}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}-${path.basename(abs)}`;
      const trashAbs = resolveSandboxed(trashRel);
      await fs.promises.mkdir(path.dirname(trashAbs), { recursive: true });
      await fs.promises.rename(abs, trashAbs);
      deleted.push(p);
      trashed.push({ path: p, trashPath: trashRel });
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
        deleted.push(p);
        continue;
      }
      errors.push({ path: p, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { deleted, trashed, errors };
}

/** Undoes one `deleteEntries` trashing — moves the item back from `.trash` to its original path. */
export async function restoreEntry(trashRel: string, originalRel: string): Promise<string> {
  if (!trashRel || !originalRel) throw new ApiError(400, "Missing trashPath or originalPath");
  const trashAbs = resolveSandboxed(trashRel);
  const originalAbs = resolveSandboxed(originalRel);
  const stat = await fs.promises.stat(trashAbs).catch(() => null);
  if (!stat) throw new ApiError(404, "Nothing to restore — it's no longer in the trash");
  if (await pathExists(originalAbs)) {
    throw new ApiError(409, "Something already exists at the original location", "exists");
  }
  await fs.promises.mkdir(path.dirname(originalAbs), { recursive: true });
  await fs.promises.rename(trashAbs, originalAbs);
  return toRelPath(originalAbs);
}
