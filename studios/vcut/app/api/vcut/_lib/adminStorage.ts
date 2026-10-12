import fs from "node:fs/promises";
import syncFs from "node:fs";
import path from "node:path";

const DAY_MS = 86_400_000;
export interface StorageFile {
  relativePath: string;
  bytes: number;
  modifiedMs: number;
  category: string;
}
/** Bounded inventory of the mounted VCut volume. Symlinks are never followed. */
export async function inspectAdminStorage(root: string, maxFiles = 100000) {
  const rootStat = await fs
    .lstat(root)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
  if (rootStat?.isSymbolicLink())
    throw new Error("The VCut data root must not be a symlink");
  if (!rootStat)
    return {
      files: [] as StorageFile[],
      bytes: 0,
      fileCount: 0,
      incomplete: false,
      unreadable: 0,
      disk: null,
    };
  const files: StorageFile[] = [];
  let incomplete = false,
    unreadable = 0,
    visited = 0;
  async function walk(dir: string, depth: number) {
    if (depth > 10 || visited >= maxFiles) {
      incomplete = true;
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      unreadable++;
      return;
    }
    for (const entry of entries) {
      if (++visited > maxFiles) {
        incomplete = true;
        break;
      }
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(absolute, depth + 1);
      else if (entry.isFile()) {
        try {
          const stat = await fs.lstat(absolute);
          if (!stat.isFile() || stat.isSymbolicLink()) continue;
          const relativePath = path
            .relative(root, absolute)
            .split(path.sep)
            .join("/");
          const parts = relativePath.split("/");
          const category =
            parts[0] === "users"
              ? "User libraries"
              : parts[0] === "templates"
                ? "Template media"
                : parts[1] === "exports"
                  ? "Exports"
                  : parts[1] === "scratch"
                    ? "Scratch"
                    : "Project media & data";
          files.push({
            relativePath,
            bytes: stat.size,
            modifiedMs: stat.mtimeMs,
            category,
          });
        } catch {
          unreadable++;
        }
      }
    }
  }
  await walk(root, 0);
  const disk = await fs
    .statfs(root)
    .then((s) => ({
      totalBytes: s.blocks * s.bsize,
      availableBytes: s.bavail * s.bsize,
    }))
    .catch(() => null);
  return {
    files,
    bytes: files.reduce((sum, f) => sum + f.bytes, 0),
    fileCount: files.length,
    incomplete,
    unreadable,
    disk,
  };
}
export function expiredAdminExports(
  files: StorageFile[],
  activeProjects: ReadonlySet<string>,
  now = Date.now(),
) {
  return files.filter((file) => {
    const parts = file.relativePath.split("/");
    return (
      parts.length === 3 &&
      /^[a-zA-Z0-9_-]{1,128}$/.test(parts[0]) &&
      !["users", "templates"].includes(parts[0]) &&
      parts[1] === "exports" &&
      !activeProjects.has(parts[0]) &&
      Number.isFinite(file.modifiedMs) &&
      now - file.modifiedMs > DAY_MS
    );
  });
}
/** Revalidate every parent and file at deletion, not just during the earlier inventory. */
export function removeExpiredAdminExport(
  root: string,
  file: StorageFile,
  now = Date.now(),
): boolean {
  if (expiredAdminExports([file], new Set(), now).length !== 1) return false;
  const parts = file.relativePath.split("/");
  if (parts.some((p) => !p || p === "." || p === ".." || p.includes("\\")))
    return false;
  let current = root;
  try {
    if (syncFs.lstatSync(root).isSymbolicLink()) return false;
    for (const part of parts.slice(0, -1)) {
      current = path.join(current, part);
      const stat = syncFs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    }
    const target = path.join(current, parts.at(-1)!);
    const stat = syncFs.lstatSync(target);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      now - stat.mtimeMs <= DAY_MS ||
      stat.size !== file.bytes ||
      stat.mtimeMs !== file.modifiedMs
    )
      return false;
    syncFs.unlinkSync(target);
    return true;
  } catch {
    return false;
  }
}
