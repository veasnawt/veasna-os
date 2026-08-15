import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Ai, Art, Create, Document, Folder, Game, Globe, Music, Settings as SettingsIcon, Video } from "@veasnawt/vicons";
import TerminalIcon from "./TerminalIcon";
import BrowserIcon from "./BrowserIcon";
import TaskManagerIcon from "./TaskManagerIcon";
import AboutOSIcon from "./AboutOSIcon";
import OSUpdateIcon from "./OSUpdateIcon";
import PropertiesWindow, { PropertiesSubject } from "./PropertiesWindow";
import { CELESTIAL_BODIES } from "../constants";
import { CelestialBody, PinnableId, StudioId } from "../types";
import { resolveWallpaperUrl } from "../utils/wallpaperGenerator";
import { DesktopItemData, parentPath, isDescendantOf, uniqueItemName, FOLDER_COLOR, ViewerSummary } from "../utils/desktopItems";
import {
  listFolder,
  mkdir,
  createFile,
  renameEntry,
  moveEntry,
  moveEntries,
  deleteEntries,
  copyEntries,
  downloadFile,
  rawFileUrl,
  restoreEntry,
} from "../utils/filesApi";
import { getFileKind, getFileIcon, getFileColor } from "../utils/fileTypes";
import { flattenDroppedItems, uploadDroppedFiles, isExternalFileDrag } from "../utils/dropFiles";
import { InstalledApp, loadInstalledApps, installApp, uninstallApp, faviconUrl } from "../utils/installedApps";
import { getAppsBridge } from "../utils/runtime";
import DesktopIcon, { IconPosition } from "./DesktopIcon";
import DesktopContextMenu from "./DesktopContextMenu";
import IconContextMenu from "./IconContextMenu";
import PinContextMenu from "./PinContextMenu";
import FileEditorWindow from "./FileEditorWindow";
import FilePreviewWindow from "./FilePreviewWindow";
import FileManager from "./FileManager";
import InstallAppDialog from "./InstallAppDialog";
import HiddenAppsDialog from "./HiddenAppsDialog";
import InstallSoftwareDialog from "./InstallSoftwareDialog";
import InstalledAppWindow from "./InstalledAppWindow";
import type { FloatingRect } from "./FloatingWindow";
import DragGhost from "./DragGhost";

export const STUDIO_ICONS: Record<StudioId, React.ComponentType<{ size?: number }>> = {
  rixie: Ai,
  bp: Create,
  vstudio: Video,
  art: Art,
  music: Music,
  gamedev: Game,
  memory: Folder,
  language: Document,
  settings: SettingsIcon,
  terminal: TerminalIcon,
  browser: BrowserIcon,
};

const AUTO_ARRANGE_KEY = "veasna-os:auto-arrange";
const ARRANGE_CORNER_KEY = "veasna-os:arrange-corner";
const ARRANGE_LAYOUT_KEY = "veasna-os:arrange-layout";
const ARRANGE_FIT_KEY = "veasna-os:arrange-fit";
const SHOW_DESKTOP_ICONS_KEY = "veasna-os:show-desktop-icons";
const ALIGN_TO_GRID_KEY = "veasna-os:align-to-grid";
const ICON_POSITIONS_KEY = "veasna-os:icon-positions";
const ICON_ORDER_KEY = "veasna-os:icon-order";
// Studios/File Manager/installed web apps only — hiding a real file or folder already has an
// established meaning (Delete) and hiding a system fixture (Task Manager/About OS/OS Update)
// isn't something a real OS lets you do either, so "hide" is scoped to just the "app" entries.
const HIDDEN_APPS_KEY = "veasna-os:hidden-apps";

function loadHiddenApps(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_APPS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

// Standalone File Manager icon (opens a FileManager window rooted at the Desktop). Not a StudioId/
// CelestialBody — it's List-mode-only (no 3D presence), so it's a permanent synthetic desktop entry
// alongside the real studio ids, not a real filesystem item either.
const FILE_MANAGER_ID = "filemanager";
const FILE_MANAGER_NAME = "File Manager";

// Same idea as File Manager above — a permanent synthetic desktop entry, not a real studio or file.
const TASK_MANAGER_ID = "taskmanager";
const TASK_MANAGER_NAME = "Task Manager";

// Same idea again — permanent synthetic desktop entries, not real studios or files.
const ABOUT_OS_ID = "aboutos";
const ABOUT_OS_NAME = "About OS";
const OS_UPDATE_ID = "osupdate";
const OS_UPDATE_NAME = "OS Update";

const GRID_COL_W = 104;
const GRID_ROW_H = 96;
const GRID_ORIGIN = 16;

function defaultGridPosition(index: number): IconPosition {
  const cols = 6;
  return { x: (index % cols) * GRID_COL_W + GRID_ORIGIN, y: Math.floor(index / cols) * GRID_ROW_H + GRID_ORIGIN };
}

function snapToGrid(pos: IconPosition): IconPosition {
  return {
    x: Math.max(GRID_ORIGIN, Math.round((pos.x - GRID_ORIGIN) / GRID_COL_W) * GRID_COL_W + GRID_ORIGIN),
    y: Math.max(GRID_ORIGIN, Math.round((pos.y - GRID_ORIGIN) / GRID_ROW_H) * GRID_ROW_H + GRID_ORIGIN),
  };
}

function normalizeOrder(saved: string[] | null, allIds: string[]): string[] {
  if (!saved) return allIds;
  const seen = new Set<string>();
  const valid = saved.filter((id) => {
    if (!allIds.includes(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const missing = allIds.filter((id) => !valid.includes(id));
  return [...valid, ...missing];
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Rewrites `p` from under `oldPrefix` to under `newPrefix` (exact match or any descendant); leaves it alone otherwise. */
function remapOne(p: string, oldPrefix: string, newPrefix: string): string {
  if (p === oldPrefix) return newPrefix;
  if (p.startsWith(`${oldPrefix}/`)) return newPrefix + p.slice(oldPrefix.length);
  return p;
}

type Entry = {
  id: string;
  name: string;
  color: string;
  icon: React.ComponentType<{ size?: number }>;
  kind: "studio" | "folder" | "file" | "filemanager" | "webapp" | "taskmanager" | "aboutos" | "osupdate";
  body?: CelestialBody;
  thumbnailUrl?: string;
};

/** Only meaningful while `autoArrange` is on — manual (drag-placed) positions ignore it entirely.
 *  Pure flexbox direction/wrap combinations, same technique the existing top-left layout already
 *  used (`flex-wrap content-start`), just varying which edge is the flow's start/wrap origin
 *  instead of computing per-icon coordinates by hand. */
export type ArrangeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

export const ARRANGE_CORNERS: ArrangeCorner[] = ["top-left", "top-right", "bottom-left", "bottom-right", "center"];

export const ARRANGE_CORNER_LABELS: Record<ArrangeCorner, string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
  center: "Center",
};

/** "row" (the original/default) fills left-to-right and wraps into new rows below/above — the
 *  natural reading-order flow. "column" fills top-to-bottom and wraps into new columns to the
 *  right/left instead, matching how a real Windows desktop lays icons out. Independent of
 *  `ArrangeCorner`, which only picks which edge the flow starts from. */
export type ArrangeLayout = "row" | "column";

export const ARRANGE_LAYOUTS: ArrangeLayout[] = ["row", "column"];

export const ARRANGE_LAYOUT_LABELS: Record<ArrangeLayout, string> = {
  row: "Rows",
  column: "Columns",
};

/** "grid" bounds the block to a balanced `side × side` square (`side = ceil(sqrt(count))`) sized
 *  purely off icon count — the fix for both the old "one giant nearly-full-width row plus a
 *  near-empty trailing row" look and (for "column") the min-height/flex-wrap bug documented below.
 *  "stretch" is the alternative some people just prefer: fill the FULL available width (row) or
 *  height (column) before wrapping, like the very first flexbox version of this feature did — still
 *  built on the same CSS grid underneath (via `repeat(auto-fill, …)` instead of a fixed `repeat(side,
 *  …)` count), so it doesn't reintroduce that bug. */
export type ArrangeFit = "grid" | "stretch";

export const ARRANGE_FITS: ArrangeFit[] = ["grid", "stretch"];

export const ARRANGE_FIT_LABELS: Record<ArrangeFit, string> = {
  grid: "Balanced grid",
  stretch: "Stretch to fill",
};

/** Describes an arrangement as two pieces: `outerClassName` positions a single block (the actual
 *  icon grid) at the right edge/corner of the full desktop area via plain flexbox alignment on the
 *  (already full-size) container; `blockClassName`/`blockStyle` size that block itself as a real CSS
 *  grid — either a fixed `side × side` cell count (`fit: "grid"`) or `repeat(auto-fill, …)` against
 *  an explicit 100% width/height (`fit: "stretch"`), see `ArrangeFit` above. `mirrorTransform`, when
 *  set, must be applied to BOTH the block and (identically) each individual icon — see below.
 *
 *  This replaced an earlier flexbox-only version (`flex-wrap` + `flex-row-reverse`/`flex-wrap-reverse`
 *  combinations) for two compounding reasons:
 *   1. `flex-wrap` sizes a row/column off the ENTIRE available container size — on a wide desktop
 *      that meant one giant, nearly-full-width row followed by a mostly-empty trailing row, instead
 *      of a balanced block (the same "thin strip" problem "center" hit first, just for every corner).
 *      `fit: "grid"` is the fix; `fit: "stretch"` deliberately keeps the old full-width behavior for
 *      anyone who prefers it, without reintroducing bug #2 below.
 *   2. For `layout: "column"`, a `flex-direction: column` + `flex-wrap` container relies on its OWN
 *      height being definite to know when to wrap — but this container is itself sized via `flex: 1`
 *      off ITS parent, and a flex item's default `min-height: auto` resolves against its unwrapped
 *      content size in exactly this configuration. That inflated "auto" height then wins over
 *      `flex-1`, so the container never actually stops at the available height and a "column" was
 *      really one unbroken list running behind the taskbar (confirmed via computed styles: 1676px
 *      resolved height in a 700px-tall viewport). A grid track list — whether a fixed `repeat(side,
 *      …)` count or `repeat(auto-fill, …)` against an explicit `height: 100%` — has a size that's
 *      never dependent on its own content, so there's no flex-basis/min-height ambiguity to fall into
 *      either way.
 *
 *  Reproducing the four true corners' original fill order (item 0 sits AT that corner, subsequent
 *  icons grow away from it) without flexbox's `-reverse` modifiers: the first attempt used
 *  `direction: rtl` on the block for the horizontal flip, on the theory that it would flip grid
 *  auto-placement's inline-start the same way it flips text — confirmed BY MEASURING RENDERED
 *  positions that Chromium's grid auto-placement does not actually respect `direction` here (item 0
 *  still landed at the physical left edge regardless). The fix that's actually verified to work:
 *  render icons in plain, unreversed order via `grid-auto-flow`'s own top-left-first default, then
 *  mirror the WHOLE BLOCK with `transform: scale(x, y)` (`x`/`y` each ±1) — a plain visual flip that
 *  has nothing to do with grid internals, so there's no auto-placement ambiguity to depend on. Mirror
 *  the natural top-left corner onto whichever corner this arrangement actually anchors to: `x: -1`
 *  for a right corner, `y: -1` for a bottom corner (both for bottom-right, i.e. a 180° rotation).
 *  Each individual icon then needs the SAME transform applied to itself, which — since `scale(-1)`
 *  is its own inverse — cancels the block's mirroring back out for that icon's own content (glyph,
 *  label) while leaving its mirrored POSITION within the block alone. */
function arrangeContainerLayout(
  corner: ArrangeCorner,
  layout: ArrangeLayout,
  fit: ArrangeFit,
  count: number
): {
  outerClassName: string;
  blockClassName: string;
  blockStyle: React.CSSProperties;
  mirrorTransform?: string;
} {
  const side = Math.max(1, Math.ceil(Math.sqrt(count)));
  const stretch = fit === "stretch";
  const axisStyle: React.CSSProperties =
    layout === "column"
      ? {
          gridAutoFlow: "column",
          gridTemplateRows: stretch ? `repeat(auto-fill, ${GRID_ROW_H}px)` : `repeat(${side}, ${GRID_ROW_H}px)`,
          ...(stretch ? { height: "100%" } : null),
        }
      : {
          gridTemplateColumns: stretch ? `repeat(auto-fill, ${GRID_COL_W}px)` : `repeat(${side}, ${GRID_COL_W}px)`,
          ...(stretch ? { width: "100%" } : null),
        };

  if (corner === "center") {
    return {
      outerClassName: "flex items-center justify-center",
      blockClassName: `grid gap-1 ${stretch ? (layout === "column" ? "content-center" : "justify-center") : ""}`,
      blockStyle: axisStyle,
    };
  }

  const isBottom = corner === "bottom-left" || corner === "bottom-right";
  const isRight = corner === "top-right" || corner === "bottom-right";
  const mirrorTransform = isRight || isBottom ? `scale(${isRight ? -1 : 1}, ${isBottom ? -1 : 1})` : undefined;
  return {
    outerClassName: `flex ${isRight ? "justify-end" : "justify-start"} ${isBottom ? "items-end" : "items-start"}`,
    blockClassName: "grid gap-1",
    blockStyle: { ...axisStyle, transform: mirrorTransform },
    mirrorTransform,
  };
}

/** The subset of `Entry` that's actually useful outside this component — mirrored up to
 *  VeasnaShell (see `onDesktopEntriesChange`) so ANYTHING on the desktop can be pinned to the
 *  taskbar, not just studios/filemanager. Icon isn't included: VeasnaShell/Taskbar already have
 *  their own icon-resolution for every one of these kinds (STUDIO_ICONS, Folder, Globe,
 *  getFileIcon, the system-icon components), so passing a second copy of the same React component
 *  reference across the boundary would just be redundant. */
export interface DesktopEntrySummary {
  id: string;
  name: string;
  color: string;
  kind: Entry["kind"];
}

type ViewerMeta = {
  kind: "folder" | "file" | "webapp";
  name: string;
  url?: string;
  color?: string;
  /** Forces the plain-text editor even for a kind (currently just "html") that normally opens
   *  somewhere else by default — how "Edit" reaches an .html file's actual source. */
  forceText?: boolean;
};

type ClipboardState = { paths: string[]; mode: "cut" | "copy" };

/** One reversible file-system-affecting action, pushed after it succeeds — Ctrl+Z pops and reverses
 *  the most recent one. Deliberately only covers actions that have a real, lossless inverse: a
 *  "delete" reverses via `.trash` (see the backend's `deleteEntries`/`restoreEntry`), everything else
 *  reverses via the same primitive APIs (rename/move/copy/delete) already used elsewhere in this file. */
type UndoAction =
  | { type: "create"; path: string }
  | { type: "rename"; from: string; to: string }
  | { type: "move"; moves: { from: string; to: string }[] }
  | { type: "copy"; createdPaths: string[] }
  | { type: "delete"; trashed: { path: string; trashPath: string }[] }
  | { type: "installApp"; app: InstalledApp }
  | { type: "upload"; createdPaths: string[] };

/** Result of hit-testing a drag against desktop folder icons and open window rects — `windowId` is
 *  set only when the target is an open window (vs a desktop folder icon or the desktop root itself). */
type DropHit = { targetPath: string; folderIconId: string | null; windowId: string | null };

interface TraditionalShellProps {
  onOpenApp: (body: CelestialBody) => void;
  wallpaper: string;
  /** Mirrors open folder/file windows up to VeasnaShell so the taskbar can show/restore them. */
  onViewersChange: (viewers: ViewerSummary[]) => void;
  /** Mirrors the FULL desktop entry list (not just open ones) up to VeasnaShell — lets the taskbar
   *  resolve a pinned button's name/color/kind for something that isn't currently open (a pinned
   *  file/folder/webapp doesn't stay "open" the way a pinned studio's identity is always known via
   *  the static CELESTIAL_BODIES list). */
  onDesktopEntriesChange: (entries: DesktopEntrySummary[]) => void;
  pinnedIds: PinnableId[];
  onTogglePin: (id: PinnableId) => void;
  /** Pixels of viewport bottom folder/file windows should stay clear of (0 when the taskbar isn't currently occupying space, e.g. auto-hidden). */
  taskbarReserve: number;
  /** Shared z-index counter with studio windows, so folder/file windows stack correctly against them instead of using their own separate (and eventually always-losing) range. */
  getNextZIndex: () => number;
  /** Opens the Terminal studio (if needed) and `cd`s its session into the given `.desktop`-relative
   *  path ("" = Desktop root) — owned by VeasnaShell since the terminal session itself is lifted there. */
  onOpenTerminalAt: (desktopRelPath: string) => void;
  /** Opens the Task Manager window — owned by VeasnaShell since it needs to see both studio windows
   *  AND folder/file/web-app viewers, and only VeasnaShell has visibility into both. */
  onOpenTaskManager: () => void;
  /** Opens the About OS / OS Update windows — owned by VeasnaShell for the same reason Task Manager
   *  is (its z-index/minimize state is managed alongside every other top-level floating window
   *  there), even though these two don't themselves need cross-cutting visibility. */
  onOpenAboutOS: () => void;
  onOpenOSUpdate: () => void;
  /** Opens an .html/.htm file's rendered content in the Browser studio — owned by VeasnaShell since
   *  the Browser's navigation history is lifted there (same reasoning as `onOpenTerminalAt`). */
  onOpenInBrowser: (url: string) => void;
}

export interface TraditionalShellHandle {
  toggleViewerMinimize: (id: string) => void;
  openDesktopFileManager: () => void;
  /** Opens a specific `.desktop`-relative path directly — a folder opens a `FileManager` rooted
   *  there, a file opens it in `FileEditorWindow`. Used by the global search overlay. */
  openDesktopPath: (path: string, kind: "folder" | "file", name: string) => void;
  /** Both used by Task Manager (owned by VeasnaShell, which only sees viewers via `ViewerSummary` —
   *  these are the only way it can actually act on one). */
  closeViewer: (id: string) => void;
  focusViewer: (id: string) => void;
  /** Installs a website as a desktop web-app icon — same effect as InstallAppDialog's own submit,
   *  callable from outside this component (the Browser studio's toolbar). */
  installWebApp: (name: string, url: string) => void;
  /** Opens an installed web app by id — the taskbar pin equivalent of clicking its desktop icon.
   *  Used by VeasnaShell to make ANY desktop entry pinnable (see PinnableId/DesktopEntrySummary):
   *  studios/taskmanager/aboutos/osupdate open via VeasnaShell's own existing functions, and
   *  folder/file already have openDesktopPath above — webapp was the one kind with no way in from
   *  outside this component at all. */
  openWebApp: (id: string) => void;
}

const TraditionalShell = forwardRef<TraditionalShellHandle, TraditionalShellProps>(function TraditionalShell(
  {
    onOpenApp,
    wallpaper,
    onViewersChange,
    onDesktopEntriesChange,
    pinnedIds,
    onTogglePin,
    taskbarReserve,
    getNextZIndex,
    onOpenTerminalAt,
    onOpenTaskManager,
    onOpenAboutOS,
    onOpenOSUpdate,
    onOpenInBrowser,
  },
  ref
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [autoArrange, setAutoArrange] = useState(true);
  const [arrangeCorner, setArrangeCorner] = useState<ArrangeCorner>(() => {
    const saved = localStorage.getItem(ARRANGE_CORNER_KEY);
    return saved && ARRANGE_CORNERS.includes(saved as ArrangeCorner) ? (saved as ArrangeCorner) : "top-left";
  });
  const [arrangeLayout, setArrangeLayout] = useState<ArrangeLayout>(() => {
    const saved = localStorage.getItem(ARRANGE_LAYOUT_KEY);
    return saved && ARRANGE_LAYOUTS.includes(saved as ArrangeLayout) ? (saved as ArrangeLayout) : "row";
  });
  const [arrangeFit, setArrangeFit] = useState<ArrangeFit>(() => {
    const saved = localStorage.getItem(ARRANGE_FIT_KEY);
    return saved && ARRANGE_FITS.includes(saved as ArrangeFit) ? (saved as ArrangeFit) : "grid";
  });
  const [alignToGrid, setAlignToGrid] = useState(false);
  // The classic "Show desktop icons" master switch — distinct from per-app hiding (hiddenIds
  // below): this hides the WHOLE grid at once without touching which individual apps are hidden,
  // so toggling it back on restores exactly what was visible before.
  const [showDesktopIcons, setShowDesktopIcons] = useState(() => localStorage.getItem(SHOW_DESKTOP_ICONS_KEY) !== "false");
  const [positions, setPositions] = useState<Record<string, IconPosition>>({});
  const [order, setOrder] = useState<string[]>(() => [
    ...CELESTIAL_BODIES.map((b) => b.id),
    FILE_MANAGER_ID,
    TASK_MANAGER_ID,
    ABOUT_OS_ID,
    OS_UPDATE_ID,
  ]);
  // Top-level real entries only (desktop icon grid) — fetched from the real filesystem, not localStorage.
  const [desktopItems, setDesktopItems] = useState<DesktopItemData[]>([]);
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [showInstallSoftwareDialog, setShowInstallSoftwareDialog] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [iconContextMenu, setIconContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const [pinMenu, setPinMenu] = useState<{ x: number; y: number; id: PinnableId } | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => loadHiddenApps());
  const [showHiddenApps, setShowHiddenApps] = useState(false);

  function hideEntry(id: string) {
    setHiddenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem(HIDDEN_APPS_KEY, JSON.stringify([...next]));
      return next;
    });
  }
  function unhideEntry(id: string) {
    setHiddenIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      localStorage.setItem(HIDDEN_APPS_KEY, JSON.stringify([...next]));
      return next;
    });
  }
  const [propertiesTarget, setPropertiesTarget] = useState<PropertiesSubject | null>(null);
  const [propertiesMinimized, setPropertiesMinimized] = useState(false);
  const [propertiesZ, setPropertiesZ] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [openViewerIds, setOpenViewerIds] = useState<string[]>([]);
  // kind/name for every currently-open viewer, keyed by path — needed because an open file can be
  // nested arbitrarily deep and won't be present in the top-level-only `desktopItems` array.
  const [openViewerMeta, setOpenViewerMeta] = useState<Record<string, ViewerMeta>>({});
  const [minimizedViewerIds, setMinimizedViewerIds] = useState<Set<string>>(new Set());
  const [viewerZ, setViewerZ] = useState<Record<string, number>>({});
  // Screen rect + current browsed path for every open FileManager window, keyed by viewer id (its
  // ORIGINAL opened path — stable even as the window navigates elsewhere internally). This is what
  // lets a drag be hit-tested against open windows, not just desktop icons.
  const [windowRects, setWindowRects] = useState<Record<string, FloatingRect>>({});
  const [windowCurrentPaths, setWindowCurrentPaths] = useState<Record<string, string>>({});
  // Kept in sync via effect so `moveItems`/`pasteClipboard` can read the latest map without closing
  // over a stale render — the same StrictMode-safe pattern used for `dragIdsRef` elsewhere in this file.
  const windowCurrentPathsRef = useRef<Record<string, string>>({});
  useEffect(() => {
    windowCurrentPathsRef.current = windowCurrentPaths;
  }, [windowCurrentPaths]);
  // Bumped per-window whenever a move/copy lands in that window's currently-browsed folder from
  // OUTSIDE it (a desktop drag, another window's drag, or a desktop-initiated paste) — `FileManager`
  // watches its own `refreshToken` and re-fetches its listing when it changes. Moves/copies initiated
  // from within a window already refresh themselves locally, so this only needs to cover the other paths.
  const [windowRefreshTokens, setWindowRefreshTokens] = useState<Record<string, number>>({});
  function bumpRefreshForPath(targetPath: string) {
    const affected = Object.entries(windowCurrentPathsRef.current)
      .filter(([, p]) => p === targetPath)
      .map(([id]) => id);
    if (affected.length === 0) return;
    setWindowRefreshTokens((prev) => {
      const next = { ...prev };
      for (const id of affected) next[id] = (next[id] ?? 0) + 1;
      return next;
    });
  }
  const [externalDropTargetWindowId, setExternalDropTargetWindowId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const UNDO_STACK_LIMIT = 30;
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  function pushUndo(action: UndoAction) {
    setUndoStack((prev) => [...prev.slice(-(UNDO_STACK_LIMIT - 1)), action]);
  }
  /** Undo touches whichever folder(s) the reversed action happened to affect, which varies per type —
   *  simpler and safer to just refresh every currently open File Manager window than to precisely
   *  track which ones. Undo is not a hot path, so the extra refresh calls cost nothing noticeable. */
  function bumpRefreshForAllWindows() {
    setWindowRefreshTokens((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(windowCurrentPathsRef.current)) next[id] = (next[id] ?? 0) + 1;
      return next;
    });
  }
  /** Which "surface" currently owns keyboard shortcuts like Delete — null means the desktop itself. */
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  // Real OS files (Mac/Windows/Linux) dragged in from outside the browser onto the bare Desktop —
  // see the matching comment on FileManager's own `dragDepthRef` for why a nesting counter is needed.
  const [isExternalDragOver, setIsExternalDragOver] = useState(false);
  const desktopDragDepthRef = useRef(0);
  const [dragState, setDragState] = useState<{
    ids: string[];
    dx: number;
    dy: number;
    clientX: number;
    clientY: number;
    overFolderId: string | null;
  } | null>(null);
  // `handleIconDragEnd` fires from a mouseup listener DesktopIcon set up back at drag-start time,
  // so its closure over React state/props is fixed as of that (pre-drag) render — reading `dragState`
  // there would see a stale value. `ids` never changes for the life of one drag gesture, so a plain
  // ref (always current, immune to closure staleness) sidesteps the problem entirely.
  const dragIdsRef = useRef<string[] | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iconRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const marqueeOriginRef = useRef<{ startX: number; startY: number; dragging: boolean; additive: boolean; base: Set<string> } | null>(
    null
  );
  const lastSelectedIndexRef = useRef<number | null>(null);
  const backgroundImage = useMemo(() => resolveWallpaperUrl(wallpaper), [wallpaper]);

  async function loadRoot(): Promise<DesktopItemData[]> {
    try {
      const entries = await listFolder("");
      const items: DesktopItemData[] = entries.map((e) => ({ path: e.path, kind: e.kind, name: e.name }));
      setDesktopItems(items);
      return items;
    } catch (err) {
      setBanner(errMessage(err));
      return [];
    }
  }

  useEffect(() => {
    const savedAuto = localStorage.getItem(AUTO_ARRANGE_KEY);
    if (savedAuto === "false") setAutoArrange(false);
    const savedAlign = localStorage.getItem(ALIGN_TO_GRID_KEY);
    if (savedAlign === "true") setAlignToGrid(true);
    const savedPositions = localStorage.getItem(ICON_POSITIONS_KEY);
    if (savedPositions) {
      try {
        setPositions(JSON.parse(savedPositions));
      } catch {
        // ignore corrupt storage
      }
    }
    const savedOrder = localStorage.getItem(ICON_ORDER_KEY);
    let parsedOrder: string[] | null = null;
    if (savedOrder) {
      try {
        parsedOrder = JSON.parse(savedOrder);
      } catch {
        // ignore corrupt storage
      }
    }
    const apps = loadInstalledApps();
    setInstalledApps(apps);
    loadRoot().then((items) => {
      const allIds = [
        ...CELESTIAL_BODIES.map((b) => b.id),
        FILE_MANAGER_ID,
        TASK_MANAGER_ID,
        ABOUT_OS_ID,
        OS_UPDATE_ID,
        ...items.map((i) => i.path),
        ...apps.map((a) => a.id),
      ];
      setOrder(normalizeOrder(parsedOrder, allIds));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persistPositions(next: Record<string, IconPosition>) {
    setPositions(next);
    localStorage.setItem(ICON_POSITIONS_KEY, JSON.stringify(next));
  }

  function persistOrder(next: string[]) {
    const deduped = Array.from(new Set(next));
    setOrder(deduped);
    localStorage.setItem(ICON_ORDER_KEY, JSON.stringify(deduped));
  }

  function appendToOrder(path: string) {
    persistOrder([...order, path]);
  }

  /** Renames every currently-tracked reference (open viewers, selection, focus) under `oldPrefix`
   *  to live under `newPrefix` instead — so a window open on a renamed/moved item (or something
   *  nested inside it) keeps working instead of pointing at a path that no longer exists. */
  function remapOpenViewers(oldPrefix: string, newPrefix: string, renamedTo?: string) {
    setOpenViewerIds((prev) => prev.map((id) => remapOne(id, oldPrefix, newPrefix)));
    setViewerZ((prev) => {
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(prev)) next[remapOne(k, oldPrefix, newPrefix)] = v;
      return next;
    });
    setOpenViewerMeta((prev) => {
      const next: Record<string, ViewerMeta> = {};
      for (const [k, v] of Object.entries(prev)) {
        const meta = k === oldPrefix && renamedTo ? { ...v, name: renamedTo } : v;
        next[remapOne(k, oldPrefix, newPrefix)] = meta;
      }
      return next;
    });
    setMinimizedViewerIds((prev) => new Set(Array.from(prev).map((id) => remapOne(id, oldPrefix, newPrefix))));
    setActiveWindowId((prev) => (prev === null ? null : remapOne(prev, oldPrefix, newPrefix)));
    setSelectedIds((prev) => new Set(Array.from(prev).map((id) => remapOne(id, oldPrefix, newPrefix))));
    setWindowRects((prev) => {
      const next: Record<string, FloatingRect> = {};
      for (const [k, v] of Object.entries(prev)) next[remapOne(k, oldPrefix, newPrefix)] = v;
      return next;
    });
    setWindowCurrentPaths((prev) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) next[remapOne(k, oldPrefix, newPrefix)] = remapOne(v, oldPrefix, newPrefix);
      return next;
    });
    setClipboard((prev) => (prev ? { ...prev, paths: prev.paths.map((p) => remapOne(p, oldPrefix, newPrefix)) } : prev));
  }

  function closeViewer(id: string) {
    setOpenViewerIds((prev) => prev.filter((vid) => vid !== id));
    setOpenViewerMeta((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setWindowRects((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setWindowCurrentPaths((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setWindowRefreshTokens((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function openViewer(path: string, meta: ViewerMeta) {
    setActiveWindowId(path);
    setMinimizedViewerIds((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
    setOpenViewerIds((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setOpenViewerMeta((prev) => ({ ...prev, [path]: meta }));
    bringViewerToFront(path);
  }

  function handleToggleAutoArrange() {
    setContextMenu(null);
    if (autoArrange) {
      // Turning auto-arrange off: snapshot each icon's current flex-rendered
      // position so switching to manual placement doesn't jump anything.
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        const next = { ...positions };
        for (const id of order) {
          const el = iconRefs.current[id];
          if (el) {
            const r = el.getBoundingClientRect();
            next[id] = { x: r.left - containerRect.left, y: r.top - containerRect.top };
          }
        }
        persistPositions(next);
      }
      setAutoArrange(false);
      localStorage.setItem(AUTO_ARRANGE_KEY, "false");
    } else {
      setAutoArrange(true);
      localStorage.setItem(AUTO_ARRANGE_KEY, "true");
    }
  }

  function handleToggleShowDesktopIcons() {
    const next = !showDesktopIcons;
    setShowDesktopIcons(next);
    localStorage.setItem(SHOW_DESKTOP_ICONS_KEY, String(next));
  }

  // Picking a corner only has a visible effect while auto-arrange is on (manual/drag-placed
  // positions ignore it entirely) — turning auto-arrange on here too avoids the confusing "I picked
  // top-right and nothing happened" case for someone currently in manual placement mode.
  function handleArrangeCornerChange(corner: ArrangeCorner) {
    setArrangeCorner(corner);
    localStorage.setItem(ARRANGE_CORNER_KEY, corner);
    if (!autoArrange) {
      setAutoArrange(true);
      localStorage.setItem(AUTO_ARRANGE_KEY, "true");
    }
  }

  function handleArrangeLayoutChange(layout: ArrangeLayout) {
    setArrangeLayout(layout);
    localStorage.setItem(ARRANGE_LAYOUT_KEY, layout);
    if (!autoArrange) {
      setAutoArrange(true);
      localStorage.setItem(AUTO_ARRANGE_KEY, "true");
    }
  }

  function handleArrangeFitChange(fit: ArrangeFit) {
    setArrangeFit(fit);
    localStorage.setItem(ARRANGE_FIT_KEY, fit);
    if (!autoArrange) {
      setAutoArrange(true);
      localStorage.setItem(AUTO_ARRANGE_KEY, "true");
    }
  }

  function handleToggleAlignToGrid() {
    const next = !alignToGrid;
    setAlignToGrid(next);
    localStorage.setItem(ALIGN_TO_GRID_KEY, String(next));
    if (next) {
      const snapped: Record<string, IconPosition> = {};
      for (const [id, pos] of Object.entries(positions)) {
        snapped[id] = snapToGrid(pos);
      }
      persistPositions(snapped);
    }
    setContextMenu(null);
  }

  function handleSortByName() {
    setContextMenu(null);
    const allEntries = [
      ...CELESTIAL_BODIES.map((b) => ({ id: b.id, name: b.name })),
      { id: FILE_MANAGER_ID, name: FILE_MANAGER_NAME },
      { id: TASK_MANAGER_ID, name: TASK_MANAGER_NAME },
      { id: ABOUT_OS_ID, name: ABOUT_OS_NAME },
      { id: OS_UPDATE_ID, name: OS_UPDATE_NAME },
      ...installedApps.map((a) => ({ id: a.id, name: a.name })),
      ...desktopItems.map((i) => ({ id: i.path, name: i.name })),
    ];
    const sorted = allEntries.sort((a, b) => a.name.localeCompare(b.name)).map((e) => e.id);
    persistOrder(sorted);
    if (!autoArrange) {
      setAutoArrange(true);
      localStorage.setItem(AUTO_ARRANGE_KEY, "true");
    }
  }

  function handleRefresh() {
    setContextMenu(null);
    setSelectedIds(new Set());
    loadRoot();
  }

  function openProperties(subject: PropertiesSubject) {
    setPropertiesTarget(subject);
    setPropertiesMinimized(false);
    setPropertiesZ(getNextZIndex());
  }

  function handlePersonalize() {
    setContextMenu(null);
    const settingsBody = CELESTIAL_BODIES.find((b) => b.id === "settings");
    if (settingsBody) onOpenApp(settingsBody);
  }

  async function computeUniqueName(parent: string, base: string, ext: string): Promise<string> {
    const siblingNames =
      parent === ""
        ? [...CELESTIAL_BODIES.map((b) => b.name), FILE_MANAGER_NAME, ...desktopItems.map((i) => i.name)]
        : (await listFolder(parent)).map((e) => e.name);
    return uniqueItemName(base, ext, siblingNames.map((n) => n.toLowerCase()));
  }

  async function handleCreateFolder(parentPathArg: string | null = null): Promise<string> {
    setContextMenu(null);
    const parent = parentPathArg ?? "";
    const name = await computeUniqueName(parent, "New folder", "");
    const newPath = await mkdir(parent, name);
    pushUndo({ type: "create", path: newPath });
    if (parent === "") {
      setDesktopItems((prev) => [...prev, { path: newPath, kind: "folder", name }]);
      appendToOrder(newPath);
      setSelectedIds(new Set([newPath]));
      setRenamingId(newPath);
    }
    return newPath;
  }

  async function handleCreateFile(parentPathArg: string | null = null): Promise<string> {
    setContextMenu(null);
    const parent = parentPathArg ?? "";
    const name = await computeUniqueName(parent, "New Text Document", ".txt");
    const newPath = await createFile(parent, name);
    pushUndo({ type: "create", path: newPath });
    if (parent === "") {
      setDesktopItems((prev) => [...prev, { path: newPath, kind: "file", name }]);
      appendToOrder(newPath);
      setSelectedIds(new Set([newPath]));
      setRenamingId(newPath);
    }
    return newPath;
  }

  async function handleRenameSubmit(oldPath: string, newNameRaw: string): Promise<void> {
    setRenamingId(null);
    const trimmed = newNameRaw.trim();
    if (!trimmed) return;
    const newPath = await renameEntry(oldPath, trimmed);
    // Confirming a freshly-created item's default name (Enter without actually changing it) round-trips
    // through here too — the backend already treats that as a no-op (`newPath === oldPath`), so nothing
    // real happened and it shouldn't get its own undo entry or trigger a wasted round of state updates.
    if (newPath === oldPath) return;
    pushUndo({ type: "rename", from: oldPath, to: newPath });
    setDesktopItems((prev) => prev.map((it) => (it.path === oldPath ? { ...it, path: newPath, name: trimmed } : it)));
    setOrder((prev) => {
      if (!prev.includes(oldPath)) return prev;
      const next = Array.from(new Set(prev.map((id) => (id === oldPath ? newPath : id))));
      localStorage.setItem(ICON_ORDER_KEY, JSON.stringify(next));
      return next;
    });
    setPositions((prev) => {
      if (!(oldPath in prev)) return prev;
      const next = { ...prev };
      next[newPath] = next[oldPath];
      delete next[oldPath];
      localStorage.setItem(ICON_POSITIONS_KEY, JSON.stringify(next));
      return next;
    });
    remapOpenViewers(oldPath, newPath, trimmed);
  }

  async function handleDeleteItems(paths: string[]): Promise<void> {
    setIconContextMenu(null);
    const { deleted, trashed, errors } = await deleteEntries(paths);
    if (trashed.length > 0) pushUndo({ type: "delete", trashed });
    if (deleted.length > 0) {
      const isRemoved = (p: string) => deleted.some((d) => p === d || isDescendantOf(p, d));
      setDesktopItems((prev) => prev.filter((it) => !isRemoved(it.path)));
      setOrder((prev) => {
        const next = Array.from(new Set(prev.filter((id) => !isRemoved(id))));
        localStorage.setItem(ICON_ORDER_KEY, JSON.stringify(next));
        return next;
      });
      setPositions((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const key of Object.keys(next)) {
          if (isRemoved(key)) {
            delete next[key];
            changed = true;
          }
        }
        if (changed) localStorage.setItem(ICON_POSITIONS_KEY, JSON.stringify(next));
        return next;
      });
      setOpenViewerIds((prev) => prev.filter((id) => !isRemoved(id)));
      setOpenViewerMeta((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) if (isRemoved(k)) delete next[k];
        return next;
      });
      setViewerZ((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) if (isRemoved(k)) delete next[k];
        return next;
      });
      setMinimizedViewerIds((prev) => new Set(Array.from(prev).filter((id) => !isRemoved(id))));
      setSelectedIds((prev) => new Set(Array.from(prev).filter((id) => !isRemoved(id))));
      setActiveWindowId((prev) => (prev !== null && isRemoved(prev) ? null : prev));
      setWindowRects((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) if (isRemoved(k)) delete next[k];
        return next;
      });
      setWindowCurrentPaths((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) if (isRemoved(k)) delete next[k];
        return next;
      });
      setClipboard((prev) => (prev && prev.paths.some(isRemoved) ? null : prev));
    }
    if (errors.length > 0) setBanner(errors.map((e) => e.message).join("; "));
  }

  /** Moves items into `targetFolderPath` (or back to the desktop, if null). `isDescendantOf` blocks
   *  moving a folder into its own descendant (would create a cycle) — the API independently rejects
   *  this too, but checking client-side avoids a pointless round trip for the common accidental case. */
  async function moveItems(paths: string[], targetFolderPath: string | null): Promise<void> {
    const target = targetFolderPath ?? "";
    const movable = paths.filter((p) => {
      // Studio icons, the synthetic File Manager entry, and installed web apps aren't real
      // sandboxed files — only ever hand the backend ids it actually knows how to resolve.
      if (!desktopItemsByPath.has(p)) return false;
      if (p === target) return false;
      if (parentPath(p) === target) return false; // already there
      if (isDescendantOf(target, p)) return false;
      return true;
    });
    if (movable.length === 0) return;
    const { moved, errors } = await moveEntries(movable, target);
    for (const { from, to } of moved) remapOpenViewers(from, to);
    if (moved.length > 0) {
      pushUndo({ type: "move", moves: moved });
      await loadRoot();
      bumpRefreshForPath(target);
      const movedFrom = new Set(moved.map((m) => m.from));
      setOrder((prev) => {
        let next = prev.filter((id) => !movedFrom.has(id));
        for (const { to } of moved) {
          if (parentPath(to) === "" && !next.includes(to)) next.push(to);
        }
        next = Array.from(new Set(next));
        localStorage.setItem(ICON_ORDER_KEY, JSON.stringify(next));
        return next;
      });
      setPositions((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const { from } of moved) {
          if (from in next) {
            delete next[from];
            changed = true;
          }
        }
        if (changed) localStorage.setItem(ICON_POSITIONS_KEY, JSON.stringify(next));
        return next;
      });
    }
    if (errors.length > 0) setBanner(errors.map((e) => e.message).join("; "));
    setSelectedIds(new Set());
  }

  /** Pastes the current clipboard into `targetPath` ("" = Desktop root). Cut is just a move (reuses
   *  `moveItems`, clears the clipboard after — matches a real OS's one-shot cut+paste). Copy computes
   *  a de-duplicated name per item when pasting into the same folder the original lives in (or any
   *  other genuine name collision) using the same `uniqueItemName` helper New Folder/New File already
   *  use, and does NOT clear the clipboard (a copy can be pasted repeatedly, matching a real OS). */
  async function pasteClipboard(targetPath: string): Promise<void> {
    if (!clipboard) return;
    if (clipboard.mode === "cut") {
      const toMove = clipboard.paths;
      setClipboard(null);
      await moveItems(toMove, targetPath || null);
      return;
    }
    const siblingNames =
      targetPath === ""
        ? [...CELESTIAL_BODIES.map((b) => b.name), FILE_MANAGER_NAME, ...desktopItems.map((i) => i.name)]
        : (await listFolder(targetPath)).map((e) => e.name);
    const existingLower = siblingNames.map((n) => n.toLowerCase());
    // Only needs a fresh name when it would otherwise collide — pasting into a different folder that
    // doesn't already have something with this name keeps the original name, matching a real OS.
    const names: Record<string, string> = {};
    for (const p of clipboard.paths) {
      const base = p.split("/").pop() ?? p;
      if (parentPath(p) === targetPath || existingLower.includes(base.toLowerCase())) {
        const dotIdx = base.lastIndexOf(".");
        const nameBase = dotIdx > 0 ? base.slice(0, dotIdx) : base;
        const ext = dotIdx > 0 ? base.slice(dotIdx) : "";
        names[p] = uniqueItemName(nameBase, ext, existingLower);
      }
    }
    const { copied, errors } = await copyEntries(clipboard.paths, targetPath, names);
    if (copied.length > 0) {
      pushUndo({ type: "copy", createdPaths: copied.map((c) => c.to) });
      if (targetPath === "") {
        await loadRoot();
        setOrder((prev) => {
          let next = [...prev];
          for (const { to } of copied) {
            if (parentPath(to) === "" && !next.includes(to)) next.push(to);
          }
          next = Array.from(new Set(next));
          localStorage.setItem(ICON_ORDER_KEY, JSON.stringify(next));
          return next;
        });
      }
      bumpRefreshForPath(targetPath);
    }
    if (errors.length > 0) setBanner(errors.map((e) => e.message).join("; "));
  }

  /** Imports real OS files (dragged in from the host Mac/Windows/Linux desktop) into `targetPath`
   *  ("" = Desktop root). Mirrors `pasteClipboard`'s copy-branch: de-duplicates against the target
   *  folder's current listing via the same `uniqueItemName` helper, then refreshes whichever surface
   *  needs it (the desktop icon layer for the root, or any open File Manager window on that path). */
  async function handleExternalFilesDropped(dataTransfer: DataTransfer, targetPath: string): Promise<void> {
    const dropped = await flattenDroppedItems(dataTransfer);
    if (dropped.length === 0) return;
    const siblingNames =
      targetPath === ""
        ? [...CELESTIAL_BODIES.map((b) => b.name), FILE_MANAGER_NAME, ...desktopItems.map((i) => i.name)]
        : (await listFolder(targetPath)).map((e) => e.name);
    const { uploadedTopNames, errors } = await uploadDroppedFiles(
      dropped,
      targetPath,
      siblingNames.map((n) => n.toLowerCase())
    );
    if (uploadedTopNames.length > 0) {
      pushUndo({
        type: "upload",
        createdPaths: uploadedTopNames.map((name) => (targetPath ? `${targetPath}/${name}` : name)),
      });
      if (targetPath === "") {
        await loadRoot();
        setOrder((prev) => {
          let next = [...prev];
          for (const name of uploadedTopNames) {
            if (!next.includes(name)) next.push(name);
          }
          next = Array.from(new Set(next));
          localStorage.setItem(ICON_ORDER_KEY, JSON.stringify(next));
          return next;
        });
      }
      bumpRefreshForPath(targetPath);
    }
    if (errors.length > 0) setBanner(errors.map((e) => `${e.name}: ${e.message}`).join("; "));
  }

  /** Ctrl+Z — pops and reverses the most recent undoable action. Deliberately calls the raw
   *  `filesApi` primitives directly rather than the `handleX`/`moveItems`/`pasteClipboard` wrappers
   *  above (except where reversing IS literally "delete the thing that got created", which safely
   *  reuses `handleDeleteItems` as-is) — those wrappers call `pushUndo` themselves, and doing so again
   *  here would let a single Ctrl+Z ironically make itself undoable, growing the stack forever with no
   *  redo to ever use it. No redo is implemented — not asked for, and keeping this one-directional
   *  keeps the whole thing far simpler. */
  async function performUndo(): Promise<void> {
    const action = undoStack[undoStack.length - 1];
    if (!action) return;
    setUndoStack((prev) => prev.slice(0, -1));
    try {
      switch (action.type) {
        case "create":
        case "copy":
          await handleDeleteItems(action.type === "create" ? [action.path] : action.createdPaths);
          return;
        case "upload":
          await handleDeleteItems(action.createdPaths);
          return;
        case "rename": {
          const oldName = action.from.split("/").pop() ?? action.from;
          const restoredPath = await renameEntry(action.to, oldName);
          setDesktopItems((prev) => prev.map((it) => (it.path === action.to ? { ...it, path: restoredPath, name: oldName } : it)));
          setOrder((prev) => {
            if (!prev.includes(action.to)) return prev;
            const next = Array.from(new Set(prev.map((id) => (id === action.to ? restoredPath : id))));
            localStorage.setItem(ICON_ORDER_KEY, JSON.stringify(next));
            return next;
          });
          setPositions((prev) => {
            if (!(action.to in prev)) return prev;
            const next = { ...prev };
            next[restoredPath] = next[action.to];
            delete next[action.to];
            localStorage.setItem(ICON_POSITIONS_KEY, JSON.stringify(next));
            return next;
          });
          remapOpenViewers(action.to, restoredPath, oldName);
          bumpRefreshForAllWindows();
          return;
        }
        case "move": {
          const reversed: { from: string; to: string }[] = [];
          for (const { from, to } of action.moves) {
            const restoredPath = await moveEntry(to, parentPath(from));
            reversed.push({ from: to, to: restoredPath });
          }
          for (const { from, to } of reversed) remapOpenViewers(from, to);
          await loadRoot();
          setOrder((prev) => {
            let next = prev.filter((id) => !reversed.some((r) => r.from === id));
            for (const { to } of reversed) {
              if (parentPath(to) === "" && !next.includes(to)) next.push(to);
            }
            next = Array.from(new Set(next));
            localStorage.setItem(ICON_ORDER_KEY, JSON.stringify(next));
            return next;
          });
          bumpRefreshForAllWindows();
          return;
        }
        case "delete": {
          for (const { path: originalPath, trashPath } of action.trashed) {
            await restoreEntry(trashPath, originalPath);
          }
          await loadRoot();
          setOrder((prev) => {
            let next = [...prev];
            for (const { path: originalPath } of action.trashed) {
              if (parentPath(originalPath) === "" && !next.includes(originalPath)) next.push(originalPath);
            }
            next = Array.from(new Set(next));
            localStorage.setItem(ICON_ORDER_KEY, JSON.stringify(next));
            return next;
          });
          bumpRefreshForAllWindows();
          return;
        }
        case "installApp": {
          uninstallApp(action.app.id);
          setInstalledApps((prev) => prev.filter((a) => a.id !== action.app.id));
          setOrder((prev) => {
            const next = prev.filter((id) => id !== action.app.id);
            localStorage.setItem(ICON_ORDER_KEY, JSON.stringify(next));
            return next;
          });
          return;
        }
      }
    } catch (err) {
      setBanner(errMessage(err));
    }
  }

  const desktopItemsByPath = useMemo(() => new Map(desktopItems.map((i) => [i.path, i])), [desktopItems]);
  const installedAppsById = useMemo(() => new Map(installedApps.map((a) => [a.id, a])), [installedApps]);

  // ---- Minimize (taskbar integration) ----
  function handleMinimizeViewer(id: string) {
    setMinimizedViewerIds((prev) => new Set(prev).add(id));
    setActiveWindowId((prev) => (prev === id ? null : prev));
  }

  // Stacking order only — deliberately doesn't touch openViewerIds (taskbar button order stays
  // stable regardless of which window is currently focused, matching real OS taskbar behavior).
  function bringViewerToFront(id: string) {
    setViewerZ((prev) => ({ ...prev, [id]: getNextZIndex() }));
  }

  useImperativeHandle(ref, () => ({
    // Reads `minimizedViewerIds` directly rather than branching inside the setState updater —
    // see the note on handleIconDragEnd above for why side effects don't belong in an updater.
    toggleViewerMinimize(id: string) {
      const wasMinimized = minimizedViewerIds.has(id);
      setMinimizedViewerIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      if (wasMinimized) {
        setActiveWindowId(id);
        bringViewerToFront(id);
      }
    },
    openDesktopFileManager() {
      openViewer("", { kind: "folder", name: "Desktop" });
    },
    openDesktopPath(path: string, kind: "folder" | "file", name: string) {
      if (kind === "file" && getFileKind(name) === "html") {
        onOpenInBrowser(rawFileUrl(path));
        return;
      }
      openViewer(path, { kind, name });
    },
    closeViewer(id: string) {
      closeViewer(id);
    },
    focusViewer(id: string) {
      setMinimizedViewerIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setActiveWindowId(id);
      bringViewerToFront(id);
    },
    // Same install path as InstallAppDialog's own onInstall below — used by the Browser studio's
    // "Install as App" button, which lives outside this component entirely (a sibling <Window> in
    // VeasnaShell), so it has no direct access to this desktop's installedApps/order state.
    installWebApp(name: string, url: string) {
      const app = installApp(name, url);
      setInstalledApps((prev) => [...prev, app]);
      appendToOrder(app.id);
      pushUndo({ type: "installApp", app });
    },
    openWebApp(id: string) {
      const app = installedAppsById.get(id);
      if (app) openViewer(app.id, { kind: "webapp", name: app.name, url: app.url, color: app.color });
    },
  }));

  const viewers: ViewerSummary[] = useMemo(
    () =>
      openViewerIds
        .map((id): ViewerSummary | null => {
          const meta = openViewerMeta[id];
          if (!meta) return null;
          return { id, name: meta.name, kind: meta.kind, minimized: minimizedViewerIds.has(id), color: meta.color };
        })
        .filter((v): v is ViewerSummary => v !== null),
    [openViewerIds, openViewerMeta, minimizedViewerIds]
  );

  useEffect(() => {
    onViewersChange(viewers);
  }, [viewers, onViewersChange]);

  // Clear the mirrored taskbar list if this shell unmounts (e.g. switching to 3D mode) so
  // no orphaned "restore" buttons are left pointing at windows that no longer exist.
  useEffect(() => {
    return () => onViewersChange([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Defensive: renders at most one icon per id even if `order` somehow ends up with a duplicate
  // (e.g. desynced localStorage from an earlier bug/session) — a duplicate id would otherwise
  // render two icons that are impossible to tell apart and share one `selectedIds` entry, making
  // "select one" visually select both and delete/rename only ever affect one of them.
  // Memoized (unlike most other derived values in this component) specifically so
  // onDesktopEntriesChange's effect below doesn't fire on every single render — every OTHER
  // consumer of `entries` reads it fresh during the same render anyway, so this is purely about
  // that one effect's dependency identity, not about avoiding recomputation for its own sake.
  const entries: Entry[] = useMemo(() => {
    const seenEntryIds = new Set<string>();
    return order
      .filter((id) => {
        if (seenEntryIds.has(id)) return false;
        seenEntryIds.add(id);
        return true;
      })
      .map((id): Entry | null => {
        const body = CELESTIAL_BODIES.find((b) => b.id === id);
        if (body) {
          return { id: body.id, name: body.name, color: body.color, icon: STUDIO_ICONS[body.id], kind: "studio", body };
        }
        if (id === FILE_MANAGER_ID) {
          return { id: FILE_MANAGER_ID, name: FILE_MANAGER_NAME, color: FOLDER_COLOR, icon: Folder, kind: "filemanager" };
        }
        if (id === TASK_MANAGER_ID) {
          return {
            id: TASK_MANAGER_ID,
            name: TASK_MANAGER_NAME,
            color: "#f87171",
            icon: TaskManagerIcon,
            kind: "taskmanager",
          };
        }
        if (id === ABOUT_OS_ID) {
          return { id: ABOUT_OS_ID, name: ABOUT_OS_NAME, color: "#38bdf8", icon: AboutOSIcon, kind: "aboutos" };
        }
        if (id === OS_UPDATE_ID) {
          return { id: OS_UPDATE_ID, name: OS_UPDATE_NAME, color: "#34d399", icon: OSUpdateIcon, kind: "osupdate" };
        }
        const app = installedAppsById.get(id);
        if (app) {
          return { id: app.id, name: app.name, color: app.color, icon: Globe, kind: "webapp", thumbnailUrl: faviconUrl(app.url) };
        }
        const item = desktopItemsByPath.get(id);
        if (item) {
          return {
            id: item.path,
            name: item.name,
            color: item.kind === "folder" ? FOLDER_COLOR : getFileColor(item.name),
            icon: item.kind === "folder" ? Folder : getFileIcon(item.name),
            kind: item.kind,
            thumbnailUrl: item.kind === "file" && getFileKind(item.name) === "image" ? rawFileUrl(item.path) : undefined,
          };
        }
        return null;
      })
      .filter((e): e is Entry => e !== null);
  }, [order, installedAppsById, desktopItemsByPath]);

  // "Hide from Desktop" applies to any of the 8 entry kinds — `entries` itself stays the full
  // unfiltered list (used for drag/lookup logic elsewhere), this is just what actually gets
  // rendered in the icon grid.
  const visibleEntries = entries.filter((e) => !hiddenIds.has(e.id));
  const hiddenEntries = entries.filter((e) => hiddenIds.has(e.id));

  useEffect(() => {
    onDesktopEntriesChange(entries.map((e) => ({ id: e.id, name: e.name, color: e.color, kind: e.kind })));
  }, [entries, onDesktopEntriesChange]);

  // ---- Delete / Cut / Copy / Paste keys (desktop only — a FileManager window handles its own) ----
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (renamingId || activeWindowId !== null) return;
      if (e.key === "Delete") {
        if (selectedIds.size === 0) return;
        const deletable = Array.from(selectedIds).filter((id) => desktopItemsByPath.has(id));
        if (deletable.length > 0) handleDeleteItems(deletable).catch((err) => setBanner(errMessage(err)));
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "c" || e.key === "C")) {
        const items = Array.from(selectedIds).filter((id) => desktopItemsByPath.has(id));
        if (items.length > 0) setClipboard({ paths: items, mode: "copy" });
        return;
      }
      if (mod && (e.key === "x" || e.key === "X")) {
        const items = Array.from(selectedIds).filter((id) => desktopItemsByPath.has(id));
        if (items.length > 0) setClipboard({ paths: items, mode: "cut" });
        return;
      }
      if (mod && (e.key === "v" || e.key === "V")) {
        if (clipboard) pasteClipboard("").catch((err) => setBanner(errMessage(err)));
        return;
      }
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        performUndo();
        return;
      }
      if (e.key === "Escape") setClipboard(null);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, renamingId, desktopItemsByPath, activeWindowId, clipboard, undoStack]);

  // ---- Selection (click / ctrl-click / shift-click) ----
  function handleIconSelect(id: string, index: number, e: React.MouseEvent) {
    setActiveWindowId(null);
    if (e.shiftKey && lastSelectedIndexRef.current !== null) {
      const [a, b] = [lastSelectedIndexRef.current, index].sort((x, y) => x - y);
      setSelectedIds(new Set(entries.slice(a, b + 1).map((en) => en.id)));
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      lastSelectedIndexRef.current = index;
    } else {
      setSelectedIds(new Set([id]));
      lastSelectedIndexRef.current = index;
    }
  }

  // ---- Marquee (rubber-band) selection on empty desktop ----
  function handleDesktopMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    setActiveWindowId(null);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    marqueeOriginRef.current = {
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      dragging: false,
      additive,
      base: additive ? new Set(selectedIds) : new Set(),
    };

    function handleMove(ev: MouseEvent) {
      const origin = marqueeOriginRef.current;
      if (!origin) return;
      const curX = ev.clientX - rect.left;
      const curY = ev.clientY - rect.top;
      if (!origin.dragging && Math.hypot(curX - origin.startX, curY - origin.startY) > 4) {
        origin.dragging = true;
      }
      if (origin.dragging) {
        const x = Math.min(origin.startX, curX);
        const y = Math.min(origin.startY, curY);
        const w = Math.abs(curX - origin.startX);
        const h = Math.abs(curY - origin.startY);
        setMarqueeRect({ x, y, w, h });
        const hits = new Set(origin.base);
        for (const [id, el] of Object.entries(iconRefs.current)) {
          if (!el) continue;
          const r = el.getBoundingClientRect();
          const rx = r.left - rect.left;
          const ry = r.top - rect.top;
          if (rx < x + w && rx + r.width > x && ry < y + h && ry + r.height > y) {
            hits.add(id);
          }
        }
        setSelectedIds(hits);
      }
    }

    function handleUp() {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      const origin = marqueeOriginRef.current;
      marqueeOriginRef.current = null;
      setMarqueeRect(null);
      if (!origin?.dragging && !origin?.additive) {
        setSelectedIds(new Set());
        lastSelectedIndexRef.current = null;
      }
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  // ---- Drag (reposition, or drop onto a folder icon / an open window to move files into it) ----
  /** Checks desktop folder icons first, then any open window's screen rect (excluding
   *  `excludeWindowIds`, e.g. the window a drag originated from) — the single hit-test both the
   *  desktop-icon drag and every open window's own internal drag fall back to, so "drop into an
   *  already-open window" and "drop into a different open window" both resolve through this. */
  function hitTestDropTarget(
    clientX: number,
    clientY: number,
    excludeIds: string[],
    excludeWindowIds: string[] = []
  ): DropHit | null {
    for (const entry of entries) {
      if (entry.kind !== "folder" || excludeIds.includes(entry.id)) continue;
      const el = iconRefs.current[entry.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return { targetPath: entry.id, folderIconId: entry.id, windowId: null };
      }
    }
    for (const [winId, rect] of Object.entries(windowRects)) {
      if (excludeWindowIds.includes(winId)) continue;
      if (
        clientX >= rect.x &&
        clientX <= rect.x + rect.width &&
        clientY >= rect.y &&
        clientY <= rect.y + rect.height
      ) {
        return { targetPath: windowCurrentPaths[winId] ?? winId, folderIconId: null, windowId: winId };
      }
    }
    return null;
  }

  /** Same hit-test, scoped for a specific open window's own internal drag (its own tiles/breadcrumbs
   *  are checked by the window itself first — this is only the "did it land on something ELSE"
   *  fallback: another window, a desktop folder icon, or — if nothing else matches — the Desktop
   *  root, since dragging something out of a window has to land *somewhere*). */
  function resolveExternalDropTarget(clientX: number, clientY: number, excludeWindowId: string): DropHit {
    const hit = hitTestDropTarget(clientX, clientY, [], [excludeWindowId]);
    return hit ?? { targetPath: "", folderIconId: null, windowId: null };
  }

  function handleIconDragStart(id: string) {
    setActiveWindowId(null);
    const ids = selectedIds.has(id) && selectedIds.size > 1 ? Array.from(selectedIds) : [id];
    if (ids.length === 1) {
      setSelectedIds(new Set(ids));
      lastSelectedIndexRef.current = entries.findIndex((en) => en.id === id);
    }
    dragIdsRef.current = ids;
    setDragState({ ids, dx: 0, dy: 0, clientX: 0, clientY: 0, overFolderId: null });
  }

  function handleIconDragMove(dx: number, dy: number, clientX: number, clientY: number) {
    const ids = dragIdsRef.current ?? [];
    const hit = hitTestDropTarget(clientX, clientY, ids);
    setDragState((prev) => (prev ? { ...prev, dx, dy, clientX, clientY, overFolderId: hit?.folderIconId ?? null } : prev));
    setExternalDropTargetWindowId(hit?.windowId ?? null);
  }

  function handleIconDragEnd(dx: number, dy: number, clientX: number, clientY: number) {
    // Reads `ids` from the ref (always current) rather than `dragState` (this closure's `dragState`
    // is fixed as of the render active when this drag's mousedown fired — stale by the time a real
    // drag gesture ends) or a setState updater (React's dev-mode StrictMode double-invokes updater
    // functions, and `moveItems` is a real async side effect now — a genuine fs.rename, not the old
    // harmless/idempotent in-memory reassignment — so calling it from inside one fired the same move
    // twice, and the second attempt failed with ENOENT since the first had already renamed it away).
    const ids = dragIdsRef.current;
    dragIdsRef.current = null;
    setDragState(null);
    setExternalDropTargetWindowId(null);
    if (!ids) return;
    const hit = hitTestDropTarget(clientX, clientY, ids);
    if (hit) {
      moveItems(ids, hit.targetPath).catch((err) => setBanner(errMessage(err)));
    } else if (!autoArrange) {
      const nextPositions = { ...positions };
      for (const id of ids) {
        const idx = entries.findIndex((en) => en.id === id);
        const base = positions[id] ?? defaultGridPosition(idx >= 0 ? idx : 0);
        const raw = { x: base.x + dx, y: base.y + dy };
        nextPositions[id] = alignToGrid
          ? snapToGrid(raw)
          : {
              x: Math.max(0, Math.min(raw.x, window.innerWidth - 110)),
              y: Math.max(0, Math.min(raw.y, window.innerHeight - 116)),
            };
      }
      persistPositions(nextPositions);
    }
  }

  function handleDesktopExternalDragEnter(e: React.DragEvent) {
    if (!isExternalFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    desktopDragDepthRef.current += 1;
    setIsExternalDragOver(true);
  }

  function handleDesktopExternalDragOver(e: React.DragEvent) {
    if (!isExternalFileDrag(e.dataTransfer)) return;
    e.preventDefault();
  }

  function handleDesktopExternalDragLeave(e: React.DragEvent) {
    if (!isExternalFileDrag(e.dataTransfer)) return;
    desktopDragDepthRef.current = Math.max(0, desktopDragDepthRef.current - 1);
    if (desktopDragDepthRef.current === 0) setIsExternalDragOver(false);
  }

  function handleDesktopExternalDrop(e: React.DragEvent) {
    if (!isExternalFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    desktopDragDepthRef.current = 0;
    setIsExternalDragOver(false);
    handleExternalFilesDropped(e.dataTransfer, "").catch((err) => setBanner(errMessage(err)));
  }

  const arrangement = arrangeContainerLayout(arrangeCorner, arrangeLayout, arrangeFit, visibleEntries.length);

  function renderDesktopIcon(entry: Entry, index: number) {
    return (
      <DesktopIcon
        ref={(el) => {
          iconRefs.current[entry.id] = el;
        }}
        id={entry.id}
        name={entry.name}
        color={entry.color}
        icon={entry.icon}
        thumbnailUrl={entry.thumbnailUrl}
        selected={selectedIds.has(entry.id)}
        onSelect={(e) => handleIconSelect(entry.id, index, e)}
        onOpen={() => {
          if (entry.kind === "studio" && entry.body) {
            onOpenApp(entry.body);
          } else if (entry.kind === "filemanager") {
            openViewer("", { kind: "folder", name: "Desktop" });
          } else if (entry.kind === "webapp") {
            const app = installedAppsById.get(entry.id);
            if (app) openViewer(app.id, { kind: "webapp", name: app.name, url: app.url, color: app.color });
          } else if (entry.kind === "taskmanager") {
            onOpenTaskManager();
          } else if (entry.kind === "aboutos") {
            onOpenAboutOS();
          } else if (entry.kind === "osupdate") {
            onOpenOSUpdate();
          } else if (entry.kind === "file" && getFileKind(entry.name) === "html") {
            onOpenInBrowser(rawFileUrl(entry.id));
          } else {
            openViewer(entry.id, { kind: entry.kind as "folder" | "file", name: entry.name });
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSelectedIds((prev) => (prev.has(entry.id) ? prev : new Set([entry.id])));
          if (
            entry.kind === "studio" ||
            entry.kind === "filemanager" ||
            entry.kind === "taskmanager" ||
            entry.kind === "aboutos" ||
            entry.kind === "osupdate"
          ) {
            // Nothing to Cut/Copy/Rename/Delete/Download for these — just Pin/Unpin (and
            // Hide, for the ones hideEntry's scope covers) via the shared PinContextMenu.
            setPinMenu({ x: e.clientX, y: e.clientY, id: entry.id as PinnableId });
          } else {
            setIconContextMenu({ x: e.clientX, y: e.clientY, itemId: entry.id });
          }
        }}
        position={autoArrange ? null : positions[entry.id] ?? defaultGridPosition(index)}
        isDragging={dragState?.ids.includes(entry.id) ?? false}
        dropHighlight={dragState?.overFolderId === entry.id}
        isCut={clipboard?.mode === "cut" && clipboard.paths.includes(entry.id)}
        onDragStart={() => handleIconDragStart(entry.id)}
        onDragMove={handleIconDragMove}
        onDragEnd={handleIconDragEnd}
        renaming={renamingId === entry.id}
        onRenameSubmit={(name) => handleRenameSubmit(entry.id, name).catch((err) => setBanner(errMessage(err)))}
        onRenameCancel={() => setRenamingId(null)}
        onRequestRename={entry.kind === "file" || entry.kind === "folder" ? () => setRenamingId(entry.id) : undefined}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden bg-[#050810] text-slate-100 select-none bg-cover bg-center"
      style={{ backgroundImage: `url(${backgroundImage})` }}
      onContextMenu={(e) => {
        e.preventDefault();
        setSelectedIds(new Set());
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
      onDragEnter={handleDesktopExternalDragEnter}
      onDragOver={handleDesktopExternalDragOver}
      onDragLeave={handleDesktopExternalDragLeave}
      onDrop={handleDesktopExternalDrop}
    >
      {isExternalDragOver && (
        <div className="pointer-events-none fixed inset-0 z-[9400] flex items-center justify-center bg-emerald-950/30 outline outline-4 -outline-offset-4 outline-dashed outline-emerald-400">
          <span className="rounded-full bg-emerald-500/90 px-5 py-2 text-sm font-semibold text-white shadow-2xl">
            Drop to add to Desktop
          </span>
        </div>
      )}
      <div
        ref={containerRef}
        onMouseDown={handleDesktopMouseDown}
        // This container is `flex-1` inside a `fixed inset-0` root (see this component's own root
        // div above) — it fills the FULL viewport height with no awareness of the taskbar's own
        // reserved space, since the taskbar is a separate sibling overlay in VeasnaShell, not a
        // proper flex sibling here. That's invisible for top-anchored/centered layouts (icons never
        // reach that far down), but a bottom-anchored arrangement (see ARRANGE_CORNER_CLASSES)
        // pushes icons straight to the true viewport bottom — directly under where the taskbar
        // visually sits, hiding them behind it. The extra bottom padding stops icons short of that.
        //
        // `min-h-0` overrides the flex item's default `min-height: auto` — without it, a
        // `flex-direction: column` + `flex-wrap` layout (the "Columns" arrangement) never actually
        // wraps: the browser computes this item's auto min-height off its CONTENT'S unwrapped size
        // (since column-wrap's min-content height is defined as if wrap were off), which for a tall
        // icon list is taller than the viewport — that inflated min-height then wins over `flex-1`,
        // so the container grows to fit every icon in one unbroken column instead of stopping at the
        // available height and wrapping into a second one. Confirmed via computed styles: without
        // this, the container's resolved height was 1676px in a 700px-tall viewport. Row layout
        // never hit this because its wrap axis (horizontal) isn't the one `flex-1` stretches.
        style={{ paddingBottom: taskbarReserve }}
        className={`relative min-h-0 flex-1 p-4 ${autoArrange ? arrangement.outerClassName : ""}`}
      >
        {showDesktopIcons &&
          (autoArrange ? (
            // A real, size-bounded block (see arrangeContainerLayout's own comment) instead of
            // rendering icons straight into this full-desktop container — that's what lets the
            // block be capped to a balanced `side × side` size and anchored at a corner via the
            // outer flex alignment above, rather than one row/column stretching across whatever
            // space happens to be available.
            <div className={arrangement.blockClassName} style={arrangement.blockStyle}>
              {visibleEntries.map((entry, index) => (
                // Applying the block's own mirror transform AGAIN here cancels it back out (`scale(-1)`
                // is its own inverse) for this icon's content specifically — otherwise its glyph and
                // label would render mirrored along with the block's corner-flipping.
                <div key={entry.id} style={{ transform: arrangement.mirrorTransform }}>
                  {renderDesktopIcon(entry, index)}
                </div>
              ))}
            </div>
          ) : (
            visibleEntries.map((entry, index) => <React.Fragment key={entry.id}>{renderDesktopIcon(entry, index)}</React.Fragment>)
          ))}

        {marqueeRect && (
          <div
            style={{ left: marqueeRect.x, top: marqueeRect.y, width: marqueeRect.w, height: marqueeRect.h }}
            className="pointer-events-none absolute z-20 rounded-sm border border-sky-400/80 bg-sky-400/15"
          />
        )}
      </div>

      {dragState &&
        dragState.ids.length > 0 &&
        (() => {
          const first = entries.find((en) => en.id === dragState.ids[0]);
          if (!first) return null;
          return (
            <DragGhost
              x={dragState.clientX}
              y={dragState.clientY}
              label={dragState.ids.length > 1 ? `${dragState.ids.length} items` : first.name}
              color={first.color}
              icon={first.icon}
              count={dragState.ids.length}
            />
          );
        })()}

      {openViewerIds.map((id, idx) => {
        const meta = openViewerMeta[id];
        if (!meta) return null;
        const minimized = minimizedViewerIds.has(id);
        if (meta.kind === "folder") {
          return (
            <FileManager
              key={id}
              rootPath={id}
              cascadeIndex={idx}
              zIndex={viewerZ[id] ?? 200 + idx}
              isActive={activeWindowId === id}
              taskbarReserve={taskbarReserve}
              minimized={minimized}
              onClose={() => closeViewer(id)}
              onMinimize={() => handleMinimizeViewer(id)}
              onFocus={() => {
                setActiveWindowId(id);
                bringViewerToFront(id);
              }}
              onCreateFolder={handleCreateFolder}
              onCreateFile={handleCreateFile}
              onRename={handleRenameSubmit}
              onDelete={handleDeleteItems}
              onMove={moveItems}
              onOpenFile={(filePath, fileName) => {
                if (getFileKind(fileName) === "html") {
                  onOpenInBrowser(rawFileUrl(filePath));
                } else {
                  openViewer(filePath, { kind: "file", name: fileName });
                }
              }}
              onEditFile={(filePath, fileName) => openViewer(filePath, { kind: "file", name: fileName, forceText: true })}
              onOpenProperties={(filePath, kind, name) => openProperties({ kind, name, path: filePath })}
              onRectChange={(rect) => setWindowRects((prev) => ({ ...prev, [id]: rect }))}
              onCurrentPathChange={(path) => setWindowCurrentPaths((prev) => ({ ...prev, [id]: path }))}
              refreshToken={windowRefreshTokens[id]}
              resolveExternalDropTarget={(clientX, clientY) => resolveExternalDropTarget(clientX, clientY, id)}
              onExternalHoverChange={(winId) => setExternalDropTargetWindowId(winId)}
              isExternalDropTarget={externalDropTargetWindowId === id}
              clipboard={clipboard}
              onCut={(paths) => setClipboard({ paths, mode: "cut" })}
              onCopy={(paths) => setClipboard({ paths, mode: "copy" })}
              onClearClipboard={() => setClipboard(null)}
              onPaste={pasteClipboard}
              onUndo={performUndo}
              onOpenTerminal={onOpenTerminalAt}
            />
          );
        }
        if (meta.kind === "webapp") {
          return (
            <InstalledAppWindow
              key={id}
              name={meta.name}
              url={meta.url ?? ""}
              color={meta.color ?? "#38bdf8"}
              icon={Globe}
              cascadeIndex={idx}
              zIndex={viewerZ[id] ?? 200 + idx}
              taskbarReserve={taskbarReserve}
              minimized={minimized}
              onClose={() => closeViewer(id)}
              onMinimize={() => handleMinimizeViewer(id)}
              onFocus={() => {
                setActiveWindowId(id);
                bringViewerToFront(id);
              }}
            />
          );
        }
        const ViewerComponent =
          meta.forceText || getFileKind(meta.name) === "text" ? FileEditorWindow : FilePreviewWindow;
        return (
          <ViewerComponent
            key={id}
            path={id}
            name={meta.name}
            cascadeIndex={idx}
            zIndex={viewerZ[id] ?? 200 + idx}
            taskbarReserve={taskbarReserve}
            minimized={minimized}
            onClose={() => closeViewer(id)}
            onMinimize={() => handleMinimizeViewer(id)}
            onFocus={() => {
              setActiveWindowId(id);
              bringViewerToFront(id);
            }}
          />
        );
      })}

      {contextMenu && (
        <DesktopContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          showDesktopIcons={showDesktopIcons}
          onToggleShowDesktopIcons={handleToggleShowDesktopIcons}
          autoArrange={autoArrange}
          alignToGrid={alignToGrid}
          onToggleAutoArrange={handleToggleAutoArrange}
          onToggleAlignToGrid={handleToggleAlignToGrid}
          arrangeCorner={arrangeCorner}
          onArrangeCornerChange={handleArrangeCornerChange}
          arrangeLayout={arrangeLayout}
          onArrangeLayoutChange={handleArrangeLayoutChange}
          arrangeFit={arrangeFit}
          onArrangeFitChange={handleArrangeFitChange}
          onSortByName={handleSortByName}
          onRefresh={handleRefresh}
          onPersonalize={handlePersonalize}
          onCreateFolder={() => {
            handleCreateFolder().catch((err) => setBanner(errMessage(err)));
          }}
          onCreateFile={() => {
            handleCreateFile().catch((err) => setBanner(errMessage(err)));
          }}
          onPaste={() => {
            setContextMenu(null);
            pasteClipboard("").catch((err) => setBanner(errMessage(err)));
          }}
          pasteDisabled={!clipboard}
          onOpenTerminal={() => {
            setContextMenu(null);
            onOpenTerminalAt("");
          }}
          onInstallApp={() => {
            setContextMenu(null);
            setShowInstallDialog(true);
          }}
          onInstallSoftware={
            getAppsBridge()
              ? () => {
                  setContextMenu(null);
                  setShowInstallSoftwareDialog(true);
                }
              : undefined
          }
          hiddenCount={hiddenEntries.length}
          onShowHiddenApps={() => {
            setContextMenu(null);
            setShowHiddenApps(true);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {showInstallDialog && (
        <InstallAppDialog
          onInstall={(name, url) => {
            const app = installApp(name, url);
            setInstalledApps((prev) => [...prev, app]);
            appendToOrder(app.id);
            pushUndo({ type: "installApp", app });
          }}
          onClose={() => setShowInstallDialog(false)}
        />
      )}

      {showHiddenApps && (
        <HiddenAppsDialog
          entries={hiddenEntries.map((e) => ({ id: e.id, name: e.name, color: e.color, icon: e.icon }))}
          onRestore={unhideEntry}
          onClose={() => setShowHiddenApps(false)}
        />
      )}

      {showInstallSoftwareDialog && <InstallSoftwareDialog onClose={() => setShowInstallSoftwareDialog(false)} />}

      {iconContextMenu && (
        <IconContextMenu
          x={iconContextMenu.x}
          y={iconContextMenu.y}
          count={selectedIds.has(iconContextMenu.itemId) ? Math.max(selectedIds.size, 1) : 1}
          onCut={() => {
            const ids =
              selectedIds.has(iconContextMenu.itemId) && selectedIds.size > 1
                ? Array.from(selectedIds)
                : [iconContextMenu.itemId];
            setClipboard({ paths: ids, mode: "cut" });
            setIconContextMenu(null);
          }}
          onCopy={() => {
            const ids =
              selectedIds.has(iconContextMenu.itemId) && selectedIds.size > 1
                ? Array.from(selectedIds)
                : [iconContextMenu.itemId];
            setClipboard({ paths: ids, mode: "copy" });
            setIconContextMenu(null);
          }}
          onRename={() => {
            setRenamingId(iconContextMenu.itemId);
            setIconContextMenu(null);
          }}
          onDownload={
            desktopItemsByPath.get(iconContextMenu.itemId)?.kind === "file"
              ? () => {
                  const item = desktopItemsByPath.get(iconContextMenu.itemId)!;
                  downloadFile(item.path, item.name);
                  setIconContextMenu(null);
                }
              : undefined
          }
          onEdit={
            (() => {
              const item = desktopItemsByPath.get(iconContextMenu.itemId);
              return item?.kind === "file" && getFileKind(item.name) === "html"
                ? () => {
                    openViewer(item.path, { kind: "file", name: item.name, forceText: true });
                    setIconContextMenu(null);
                  }
                : undefined;
            })()
          }
          onDelete={() => {
            const ids =
              selectedIds.has(iconContextMenu.itemId) && selectedIds.size > 1
                ? Array.from(selectedIds)
                : [iconContextMenu.itemId];
            handleDeleteItems(ids).catch((err) => setBanner(errMessage(err)));
          }}
          onUninstall={
            installedAppsById.has(iconContextMenu.itemId)
              ? () => {
                  const id = iconContextMenu.itemId;
                  uninstallApp(id);
                  setInstalledApps((prev) => prev.filter((a) => a.id !== id));
                  setOrder((prev) => {
                    const next = prev.filter((oid) => oid !== id);
                    localStorage.setItem(ICON_ORDER_KEY, JSON.stringify(next));
                    return next;
                  });
                  setSelectedIds((prev) => {
                    if (!prev.has(id)) return prev;
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                  });
                  setIconContextMenu(null);
                }
              : undefined
          }
          onHide={() => {
            hideEntry(iconContextMenu.itemId);
            setIconContextMenu(null);
          }}
          pinned={pinnedIds.includes(iconContextMenu.itemId)}
          onTogglePin={() => {
            onTogglePin(iconContextMenu.itemId);
            setIconContextMenu(null);
          }}
          onProperties={
            (() => {
              const item = desktopItemsByPath.get(iconContextMenu.itemId);
              if (item) {
                return () => {
                  openProperties({ kind: item.kind, name: item.name, path: item.path });
                  setIconContextMenu(null);
                };
              }
              const app = installedAppsById.get(iconContextMenu.itemId);
              if (app) {
                return () => {
                  openProperties({ kind: "webapp", name: app.name, url: app.url, color: app.color });
                  setIconContextMenu(null);
                };
              }
              return undefined;
            })()
          }
          onClose={() => setIconContextMenu(null)}
        />
      )}

      {pinMenu && (
        <PinContextMenu
          x={pinMenu.x}
          y={pinMenu.y}
          pinned={pinnedIds.includes(pinMenu.id)}
          onTogglePin={() => {
            onTogglePin(pinMenu.id);
            setPinMenu(null);
          }}
          onHide={() => {
            hideEntry(pinMenu.id);
            setPinMenu(null);
          }}
          onClose={() => setPinMenu(null)}
        />
      )}

      {propertiesTarget && (
        <PropertiesWindow
          subject={propertiesTarget}
          zIndex={propertiesZ}
          taskbarReserve={taskbarReserve}
          minimized={propertiesMinimized}
          onClose={() => setPropertiesTarget(null)}
          onMinimize={() => setPropertiesMinimized(true)}
          onFocus={() => setPropertiesZ(getNextZIndex())}
        />
      )}

      {banner && (
        <div
          style={{ zIndex: 9400 }}
          className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-rose-500/40 bg-rose-950/90 px-3 py-2 text-xs text-rose-200 shadow-lg backdrop-blur-md"
        >
          <span>{banner}</span>
          <button onClick={() => setBanner(null)} className="text-rose-300 transition hover:text-white">
            ×
          </button>
        </div>
      )}
    </div>
  );
});

export default TraditionalShell;
