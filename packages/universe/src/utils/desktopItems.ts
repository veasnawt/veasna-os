export interface DesktopItemData {
  id: string;
  kind: "folder" | "file";
  name: string;
  /** Id of the containing folder, or null/undefined for top-level (on the desktop). Folders and files can both be nested. */
  parentId?: string | null;
}

export function generateItemId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** True if `itemId` lives somewhere underneath `ancestorId` in the folder tree (walks up the parentId chain). */
export function isDescendantOf(
  itemId: string,
  ancestorId: string,
  itemsById: Map<string, DesktopItemData>
): boolean {
  let current = itemsById.get(itemId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = itemsById.get(current.parentId);
  }
  return false;
}

/** Mimics Windows' "New folder", "New folder (2)", ... collision handling. */
export function uniqueItemName(base: string, ext: string, existingNamesLower: string[]): string {
  let candidate = `${base}${ext}`;
  let n = 2;
  while (existingNamesLower.includes(candidate.toLowerCase())) {
    candidate = `${base} (${n})${ext}`;
    n++;
  }
  return candidate;
}

export function fileContentKey(id: string): string {
  return `veasna-os:file-content:${id}`;
}

export const FOLDER_COLOR = "#eab308";
export const FILE_COLOR = "#94a3b8";

/** A minimal summary of an open folder/file window, reported up to VeasnaShell so the taskbar can show it. */
export interface ViewerSummary {
  id: string;
  name: string;
  kind: "folder" | "file";
  minimized: boolean;
}
