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
): Promise<{ deleted: string[]; errors: { path: string; message: string }[] }> {
  return callPost({ action: "delete", paths });
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
