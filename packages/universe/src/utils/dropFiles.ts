import { uniqueItemName } from "./desktopItems";
import { uploadFile } from "./filesApi";

export interface DroppedFile {
  file: File;
  /** "/"-separated, relative to the dropped item itself — just the filename for a plain dropped
   *  file, or e.g. "MyFolder/sub/photo.jpg" when a whole folder was dragged in. */
  relPath: string;
}

function readEntryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** `readEntries()` only returns one batch per call and must be called repeatedly until it returns
 *  an empty array to get the full directory listing — a well-known quirk of this API, not a bug. */
function readAllDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    function readBatch() {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        readBatch();
      }, reject);
    }
    readBatch();
  });
}

async function walkEntry(entry: FileSystemEntry, out: DroppedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await readEntryFile(entry as FileSystemFileEntry);
    out.push({ file, relPath: entry.fullPath.replace(/^\/+/, "") });
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children = await readAllDirectoryEntries(reader);
    for (const child of children) {
      await walkEntry(child, out);
    }
  }
}

/** Flattens a native drop event's dragged items into real Files with their relative paths,
 *  recursing into dropped folders via `webkitGetAsEntry` (supported in Chrome/Edge/Firefox/Safari
 *  despite the vendor-prefixed name — there's no vendor-neutral replacement in wide use yet). Falls
 *  back to the flat `dataTransfer.files` list (no folder structure preserved) when unsupported,
 *  which still correctly handles the common case of dropping one or more plain files. */
export async function flattenDroppedItems(dataTransfer: DataTransfer): Promise<DroppedFile[]> {
  const items = dataTransfer.items;
  if (items && items.length > 0 && typeof items[0]?.webkitGetAsEntry === "function") {
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
    if (entries.length > 0) {
      const out: DroppedFile[] = [];
      for (const entry of entries) {
        await walkEntry(entry, out);
      }
      return out;
    }
  }
  return Array.from(dataTransfer.files).map((file) => ({ file, relPath: file.name }));
}

/** True when a drag carries real OS files (vs. this app's own internal mouse-driven icon/tile drag,
 *  which never sets `dataTransfer` — safe to check on `dragenter`/`dragover` before committing to
 *  showing an external-drop highlight. */
export function isExternalFileDrag(dataTransfer: DataTransfer | null): boolean {
  return !!dataTransfer && Array.from(dataTransfer.types).includes("Files");
}

export interface UploadDroppedResult {
  uploadedTopNames: string[];
  errors: { name: string; message: string }[];
}

/** Uploads a flattened drop batch into `targetFolderPath`, de-duplicating collisions against
 *  `existingNamesLower` the same way New Folder/New File/paste already do (via `uniqueItemName`).
 *  Dedup happens once per TOP-LEVEL dropped item (a whole file, or a whole dropped folder) — every
 *  file belonging to the same dropped folder shares that folder's one renamed name, rather than each
 *  nested file getting its own unrelated collision check. */
export async function uploadDroppedFiles(
  dropped: DroppedFile[],
  targetFolderPath: string,
  existingNamesLower: string[]
): Promise<UploadDroppedResult> {
  const claimedLower = new Set(existingNamesLower);
  const topNameFor = new Map<string, string>();
  const errors: { name: string; message: string }[] = [];
  const uploadedTopNames = new Set<string>();

  for (const { file, relPath } of dropped) {
    const segments = relPath.split("/");
    const originalTop = segments[0];
    let finalTop = topNameFor.get(originalTop);
    if (finalTop === undefined) {
      const dot = originalTop.lastIndexOf(".");
      // A literal "." only means a file extension when this segment IS the whole dropped item (a
      // flat file) — a top-level FOLDER name containing a "." shouldn't be split at it.
      const isWholeItem = segments.length === 1;
      const base = isWholeItem && dot > 0 ? originalTop.slice(0, dot) : originalTop;
      const ext = isWholeItem && dot > 0 ? originalTop.slice(dot) : "";
      finalTop = uniqueItemName(base, ext, Array.from(claimedLower));
      claimedLower.add(finalTop.toLowerCase());
      topNameFor.set(originalTop, finalTop);
    }
    const finalRelName = [finalTop, ...segments.slice(1)].join("/");
    try {
      await uploadFile(targetFolderPath, finalRelName, file);
      uploadedTopNames.add(finalTop);
    } catch (err) {
      errors.push({ name: relPath, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { uploadedTopNames: Array.from(uploadedTopNames), errors };
}
