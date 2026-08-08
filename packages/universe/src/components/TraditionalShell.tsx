import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Ai, Art, Create, Document, Folder, Game, Music, Settings as SettingsIcon } from "@veasnawt/vicons";
import TerminalIcon from "./TerminalIcon";
import BrowserIcon from "./BrowserIcon";
import { CELESTIAL_BODIES } from "../constants";
import { CelestialBody, PinnableId, StudioId } from "../types";
import { resolveWallpaperUrl } from "../utils/wallpaperGenerator";
import { DesktopItemData, parentPath, isDescendantOf, uniqueItemName, FOLDER_COLOR, FILE_COLOR, ViewerSummary } from "../utils/desktopItems";
import { listFolder, mkdir, createFile, renameEntry, moveEntries, deleteEntries, copyEntries } from "../utils/filesApi";
import DesktopIcon, { IconPosition } from "./DesktopIcon";
import DesktopContextMenu from "./DesktopContextMenu";
import IconContextMenu from "./IconContextMenu";
import PinContextMenu from "./PinContextMenu";
import FileEditorWindow from "./FileEditorWindow";
import FileManager from "./FileManager";
import type { FloatingRect } from "./FloatingWindow";
import DragGhost from "./DragGhost";

export const STUDIO_ICONS: Record<StudioId, React.ComponentType<{ size?: number }>> = {
  rixie: Ai,
  bp: Create,
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
const ALIGN_TO_GRID_KEY = "veasna-os:align-to-grid";
const ICON_POSITIONS_KEY = "veasna-os:icon-positions";
const ICON_ORDER_KEY = "veasna-os:icon-order";

// Standalone File Manager icon (opens a FileManager window rooted at the Desktop). Not a StudioId/
// CelestialBody — it's List-mode-only (no 3D presence), so it's a permanent synthetic desktop entry
// alongside the real studio ids, not a real filesystem item either.
const FILE_MANAGER_ID = "filemanager";
const FILE_MANAGER_NAME = "File Manager";

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
  kind: "studio" | "folder" | "file" | "filemanager";
  body?: CelestialBody;
};

type ViewerMeta = { kind: "folder" | "file"; name: string };

type ClipboardState = { paths: string[]; mode: "cut" | "copy" };

/** Result of hit-testing a drag against desktop folder icons and open window rects — `windowId` is
 *  set only when the target is an open window (vs a desktop folder icon or the desktop root itself). */
type DropHit = { targetPath: string; folderIconId: string | null; windowId: string | null };

interface TraditionalShellProps {
  onOpenApp: (body: CelestialBody) => void;
  wallpaper: string;
  /** Mirrors open folder/file windows up to VeasnaShell so the taskbar can show/restore them. */
  onViewersChange: (viewers: ViewerSummary[]) => void;
  pinnedIds: PinnableId[];
  onTogglePin: (id: PinnableId) => void;
  /** Pixels of viewport bottom folder/file windows should stay clear of (0 when the taskbar isn't currently occupying space, e.g. auto-hidden). */
  taskbarReserve: number;
  /** Shared z-index counter with studio windows, so folder/file windows stack correctly against them instead of using their own separate (and eventually always-losing) range. */
  getNextZIndex: () => number;
  /** Opens the Terminal studio (if needed) and `cd`s its session into the given `.desktop`-relative
   *  path ("" = Desktop root) — owned by VeasnaShell since the terminal session itself is lifted there. */
  onOpenTerminalAt: (desktopRelPath: string) => void;
}

export interface TraditionalShellHandle {
  toggleViewerMinimize: (id: string) => void;
  openDesktopFileManager: () => void;
  /** Opens a specific `.desktop`-relative path directly — a folder opens a `FileManager` rooted
   *  there, a file opens it in `FileEditorWindow`. Used by the global search overlay. */
  openDesktopPath: (path: string, kind: "folder" | "file", name: string) => void;
}

const TraditionalShell = forwardRef<TraditionalShellHandle, TraditionalShellProps>(function TraditionalShell(
  { onOpenApp, wallpaper, onViewersChange, pinnedIds, onTogglePin, taskbarReserve, getNextZIndex, onOpenTerminalAt },
  ref
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [autoArrange, setAutoArrange] = useState(true);
  const [alignToGrid, setAlignToGrid] = useState(false);
  const [positions, setPositions] = useState<Record<string, IconPosition>>({});
  const [order, setOrder] = useState<string[]>(() => [...CELESTIAL_BODIES.map((b) => b.id), FILE_MANAGER_ID]);
  // Top-level real entries only (desktop icon grid) — fetched from the real filesystem, not localStorage.
  const [desktopItems, setDesktopItems] = useState<DesktopItemData[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [iconContextMenu, setIconContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const [pinMenu, setPinMenu] = useState<{ x: number; y: number; id: PinnableId } | null>(null);
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
  /** Which "surface" currently owns keyboard shortcuts like Delete — null means the desktop itself. */
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
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
    loadRoot().then((items) => {
      const allIds = [...CELESTIAL_BODIES.map((b) => b.id), FILE_MANAGER_ID, ...items.map((i) => i.path)];
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
    const { deleted, errors } = await deleteEntries(paths);
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
      if (p === target) return false;
      if (parentPath(p) === target) return false; // already there
      if (isDescendantOf(target, p)) return false;
      return true;
    });
    if (movable.length === 0) return;
    const { moved, errors } = await moveEntries(movable, target);
    for (const { from, to } of moved) remapOpenViewers(from, to);
    if (moved.length > 0) {
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

  const desktopItemsByPath = useMemo(() => new Map(desktopItems.map((i) => [i.path, i])), [desktopItems]);

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
      openViewer(path, { kind, name });
    },
  }));

  const viewers: ViewerSummary[] = useMemo(
    () =>
      openViewerIds
        .map((id): ViewerSummary | null => {
          const meta = openViewerMeta[id];
          if (!meta) return null;
          return { id, name: meta.name, kind: meta.kind, minimized: minimizedViewerIds.has(id) };
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
  const seenEntryIds = new Set<string>();
  const entries: Entry[] = order
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
      const item = desktopItemsByPath.get(id);
      if (item) {
        return {
          id: item.path,
          name: item.name,
          color: item.kind === "folder" ? FOLDER_COLOR : FILE_COLOR,
          icon: item.kind === "folder" ? Folder : Document,
          kind: item.kind,
        };
      }
      return null;
    })
    .filter((e): e is Entry => e !== null);

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
      if (e.key === "Escape") setClipboard(null);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, renamingId, desktopItemsByPath, activeWindowId, clipboard]);

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

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden bg-[#050810] text-slate-100 select-none bg-cover bg-center"
      style={{ backgroundImage: `url(${backgroundImage})` }}
      onContextMenu={(e) => {
        e.preventDefault();
        setSelectedIds(new Set());
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div
        ref={containerRef}
        onMouseDown={handleDesktopMouseDown}
        className={`relative flex-1 p-4 ${autoArrange ? "flex flex-wrap content-start gap-1" : ""}`}
      >
        {entries.map((entry, index) => {
          return (
            <DesktopIcon
              key={entry.id}
              ref={(el) => {
                iconRefs.current[entry.id] = el;
              }}
              id={entry.id}
              name={entry.name}
              color={entry.color}
              icon={entry.icon}
              selected={selectedIds.has(entry.id)}
              onSelect={(e) => handleIconSelect(entry.id, index, e)}
              onOpen={() => {
                if (entry.kind === "studio" && entry.body) {
                  onOpenApp(entry.body);
                } else if (entry.kind === "filemanager") {
                  openViewer("", { kind: "folder", name: "Desktop" });
                } else {
                  openViewer(entry.id, { kind: entry.kind as "folder" | "file", name: entry.name });
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedIds((prev) => (prev.has(entry.id) ? prev : new Set([entry.id])));
                if (entry.kind === "studio" || entry.kind === "filemanager") {
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
            />
          );
        })}

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
              onOpenFile={(filePath, fileName) => openViewer(filePath, { kind: "file", name: fileName })}
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
              onOpenTerminal={onOpenTerminalAt}
            />
          );
        }
        return (
          <FileEditorWindow
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
          autoArrange={autoArrange}
          alignToGrid={alignToGrid}
          onToggleAutoArrange={handleToggleAutoArrange}
          onToggleAlignToGrid={handleToggleAlignToGrid}
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
          onClose={() => setContextMenu(null)}
        />
      )}

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
          onDelete={() => {
            const ids =
              selectedIds.has(iconContextMenu.itemId) && selectedIds.size > 1
                ? Array.from(selectedIds)
                : [iconContextMenu.itemId];
            handleDeleteItems(ids).catch((err) => setBanner(errMessage(err)));
          }}
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
          onClose={() => setPinMenu(null)}
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
