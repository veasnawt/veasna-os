export interface RemoteEntry {
  name: string;
  kind: "folder" | "file";
  path: string;
}

export class FilesApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

async function callGet(action: string, params: Record<string, string>): Promise<any> {
  const query = new URLSearchParams({ action, ...params });
  const res = await fetch(`/api/files?${query.toString()}`);
  const data = await parseJson(res);
  if (!res.ok) throw new FilesApiError(data.error ?? "Request failed", data.code);
  return data;
}

async function callPost(body: Record<string, unknown>): Promise<any> {
  const res = await fetch("/api/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new FilesApiError(data.error ?? "Request failed", data.code);
  return data;
}

export async function listFolder(path: string): Promise<RemoteEntry[]> {
  const data = await callGet("list", { path });
  return data.entries;
}

/** Recursively searches the whole sandboxed desktop tree by name — used by the global search overlay. */
export async function searchFiles(query: string): Promise<RemoteEntry[]> {
  if (!query.trim()) return [];
  const data = await callGet("search", { q: query });
  return data.entries;
}

export interface EntryStat {
  kind: "folder" | "file";
  /** Bytes — for a folder, the recursive sum of everything inside it (real Windows Properties
   *  behavior), not the meaningless size of the directory inode itself. */
  size: number;
  mtime: string;
  birthtime: string;
}

/** Real size/dates for a single file or folder — used by the Properties view. Not folded into
 *  `listFolder`'s per-entry results since it costs a `stat` (and, for folders, a full recursive
 *  walk) per item — only worth paying for the one item Properties is actually open on. */
export async function statEntry(path: string): Promise<EntryStat> {
  return callGet("stat", { path });
}

/** URL for the raw-bytes file endpoint — used as an `<img src>`/`<audio src>`/`<video src>`/PDF
 *  `<iframe src>`, or as a plain "open in new tab" link. Unlike `readFile`, this never decodes
 *  anything as UTF-8 text, so it's safe for actual binary files. */
export function rawFileUrl(path: string): string {
  return `/api/files/raw?${new URLSearchParams({ path }).toString()}`;
}

/** Uploads a real OS file (or any `Blob`) into the sandboxed filesystem — used for drag-and-drop
 *  from the host OS. `relName` may contain "/" segments to preserve a dragged-in folder's internal
 *  structure; unlike `writeFile`, this sends the raw bytes as the request body instead of JSON, so
 *  it never risks corrupting binary content via text (de)serialization. */
export async function uploadFile(targetFolderPath: string, relName: string, data: Blob): Promise<string> {
  const query = new URLSearchParams({ path: targetFolderPath, name: relName });
  const res = await fetch(`/api/files/upload?${query.toString()}`, { method: "POST", body: data });
  const parsed = await parseJson(res);
  if (!res.ok) throw new FilesApiError(parsed.error ?? "Upload failed", parsed.code);
  return parsed.path;
}

/** Triggers a real browser download of a sandboxed file onto the host OS — the safe, universally
 *  supported way to get a file "out" of Veasna OS (a literal native drag-out to the desktop only
 *  works in Chromium and would conflict with the app's own mouse-driven internal drag system). */
export function downloadFile(path: string, name: string): void {
  const a = document.createElement("a");
  a.href = rawFileUrl(path);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function readFile(path: string): Promise<string> {
  const data = await callGet("readFile", { path });
  return data.content;
}

export async function writeFile(path: string, content: string): Promise<void> {
  await callPost({ action: "writeFile", path, content });
}

export async function mkdir(parentPath: string, name: string): Promise<string> {
  const data = await callPost({ action: "mkdir", path: parentPath, name });
  return data.path;
}

export async function createFile(parentPath: string, name: string): Promise<string> {
  const data = await callPost({ action: "createFile", path: parentPath, name });
  return data.path;
}

export async function renameEntry(path: string, newName: string): Promise<string> {
  const data = await callPost({ action: "rename", path, newName });
  return data.path;
}

export async function moveEntry(path: string, targetFolderPath: string): Promise<string> {
  const data = await callPost({ action: "move", path, targetFolderPath });
  return data.path;
}

export async function moveEntries(
  paths: string[],
  targetFolderPath: string
): Promise<{ moved: { from: string; to: string }[]; errors: { path: string; message: string }[] }> {
  const moved: { from: string; to: string }[] = [];
  const errors: { path: string; message: string }[] = [];
  for (const from of paths) {
    try {
      const to = await moveEntry(from, targetFolderPath);
      moved.push({ from, to });
    } catch (err) {
      errors.push({ path: from, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { moved, errors };
}

export async function deleteEntries(
  paths: string[]
): Promise<{
  deleted: string[];
  trashed: { path: string; trashPath: string }[];
  errors: { path: string; message: string }[];
}> {
  return callPost({ action: "delete", paths });
}

/** Undoes one `deleteEntries` trashing (Ctrl+Z after a delete) — moves an item back from `.trash`
 *  to its original path. */
export async function restoreEntry(trashPath: string, originalPath: string): Promise<string> {
  const data = await callPost({ action: "restore", trashPath, originalPath });
  return data.path;
}

export async function copyEntry(path: string, targetFolderPath: string, name?: string): Promise<string> {
  const data = await callPost({ action: "copy", path, targetFolderPath, name });
  return data.path;
}

export async function copyEntries(
  paths: string[],
  targetFolderPath: string,
  names?: Record<string, string>
): Promise<{ copied: { from: string; to: string }[]; errors: { path: string; message: string }[] }> {
  const copied: { from: string; to: string }[] = [];
  const errors: { path: string; message: string }[] = [];
  for (const from of paths) {
    try {
      const to = await copyEntry(from, targetFolderPath, names?.[from]);
      copied.push({ from, to });
    } catch (err) {
      errors.push({ path: from, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { copied, errors };
}
