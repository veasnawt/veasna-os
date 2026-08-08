export interface DesktopItemData {
  /** Relative to the real filesystem root, "/"-separated regardless of host OS. Doubles as this item's unique id. */
  path: string;
  kind: "folder" | "file";
  name: string;
}

export function parentPath(itemPath: string): string {
  const idx = itemPath.lastIndexOf("/");
  return idx === -1 ? "" : itemPath.slice(0, idx);
}

/** True if `candidatePath` is (or lives underneath) `ancestorPath`. `ancestorPath === ""` means the root. */
export function isDescendantOf(candidatePath: string, ancestorPath: string): boolean {
  if (ancestorPath === "") return candidatePath !== "";
  return candidatePath === ancestorPath || candidatePath.startsWith(`${ancestorPath}/`);
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

export const FOLDER_COLOR = "#eab308";
export const FILE_COLOR = "#94a3b8";

/** A minimal summary of an open folder/file window, reported up to VeasnaShell so the taskbar can show it. */
export interface ViewerSummary {
  id: string;
  name: string;
  kind: "folder" | "file";
  minimized: boolean;
}
