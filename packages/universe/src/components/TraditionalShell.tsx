import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Ai, Art, Create, Document, Folder, Game, Music, Settings as SettingsIcon } from "@veasnawt/vicons";
import { CELESTIAL_BODIES } from "../constants";
import { CelestialBody, StudioId } from "../types";
import { resolveWallpaperUrl } from "../utils/wallpaperGenerator";
import {
  DesktopItemData,
  generateItemId,
  uniqueItemName,
  fileContentKey,
  isDescendantOf,
  FOLDER_COLOR,
  FILE_COLOR,
  ViewerSummary,
} from "../utils/desktopItems";
import DesktopIcon, { IconPosition } from "./DesktopIcon";
import DesktopContextMenu from "./DesktopContextMenu";
import IconContextMenu from "./IconContextMenu";
import PinContextMenu from "./PinContextMenu";
import FileEditorWindow from "./FileEditorWindow";
import FileManager from "./FileManager";

export const STUDIO_ICONS: Record<StudioId, React.ComponentType<{ size?: number }>> = {
  rixie: Ai,
  bp: Create,
  art: Art,
  music: Music,
  gamedev: Game,
  memory: Folder,
  language: Document,
  settings: SettingsIcon,
};

const AUTO_ARRANGE_KEY = "veasna-os:auto-arrange";
const ALIGN_TO_GRID_KEY = "veasna-os:align-to-grid";
const ICON_POSITIONS_KEY = "veasna-os:icon-positions";
const ICON_ORDER_KEY = "veasna-os:icon-order";
const ICON_ITEMS_KEY = "veasna-os:desktop-items";

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
  const valid = saved.filter((id) => allIds.includes(id));
  const missing = allIds.filter((id) => !valid.includes(id));
  return [...valid, ...missing];
}

type Entry = {
  id: string;
  name: string;
  color: string;
  icon: React.ComponentType<{ size?: number }>;
  kind: "studio" | "folder" | "file";
  body?: CelestialBody;
};

interface TraditionalShellProps {
  onOpenApp: (body: CelestialBody) => void;
  wallpaper: string;
  /** Mirrors open folder/file windows up to VeasnaShell so the taskbar can show/restore them. */
  onViewersChange: (viewers: ViewerSummary[]) => void;
  pinnedIds: StudioId[];
  onTogglePin: (id: StudioId) => void;
  /** Pixels of viewport bottom folder/file windows should stay clear of (0 when the taskbar isn't currently occupying space, e.g. auto-hidden). */
  taskbarReserve: number;
}

export interface TraditionalShellHandle {
  toggleViewerMinimize: (id: string) => void;
}

const TraditionalShell = forwardRef<TraditionalShellHandle, TraditionalShellProps>(function TraditionalShell(
  { onOpenApp, wallpaper, onViewersChange, pinnedIds, onTogglePin, taskbarReserve },
  ref
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [autoArrange, setAutoArrange] = useState(true);
  const [alignToGrid, setAlignToGrid] = useState(false);
  const [positions, setPositions] = useState<Record<string, IconPosition>>({});
  const [order, setOrder] = useState<string[]>(() => CELESTIAL_BODIES.map((b) => b.id));
  const [desktopItems, setDesktopItems] = useState<DesktopItemData[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [iconContextMenu, setIconContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const [pinMenu, setPinMenu] = useState<{ x: number; y: number; studioId: StudioId } | null>(null);
  const [openViewerIds, setOpenViewerIds] = useState<string[]>([]);
  const [minimizedViewerIds, setMinimizedViewerIds] = useState<Set<string>>(new Set());
  /** Which "surface" currently owns keyboard shortcuts like Delete — null means the desktop itself. */
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ ids: string[]; dx: number; dy: number; overFolderId: string | null } | null>(
    null
  );
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iconRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const marqueeOriginRef = useRef<{ startX: number; startY: number; dragging: boolean; additive: boolean; base: Set<string> } | null>(
    null
  );
  const lastSelectedIndexRef = useRef<number | null>(null);
  const backgroundImage = useMemo(() => resolveWallpaperUrl(wallpaper), [wallpaper]);

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
    let loadedItems: DesktopItemData[] = [];
    const savedItems = localStorage.getItem(ICON_ITEMS_KEY);
    if (savedItems) {
      try {
        loadedItems = JSON.parse(savedItems);
        setDesktopItems(loadedItems);
      } catch {
        // ignore corrupt storage
      }
    }
    const topLevelIds = loadedItems.filter((i) => !i.parentId).map((i) => i.id);
    const allIds = [...CELESTIAL_BODIES.map((b) => b.id), ...topLevelIds];
    const savedOrder = localStorage.getItem(ICON_ORDER_KEY);
    let parsedOrder: string[] | null = null;
    if (savedOrder) {
      try {
        parsedOrder = JSON.parse(savedOrder);
      } catch {
        // ignore corrupt storage
      }
    }
    setOrder(normalizeOrder(parsedOrder, allIds));
  }, []);

  function persistPositions(next: Record<string, IconPosition>) {
    setPositions(next);
    localStorage.setItem(ICON_POSITIONS_KEY, JSON.stringify(next));
  }

  function persistItems(next: DesktopItemData[]) {
    setDesktopItems(next);
    localStorage.setItem(ICON_ITEMS_KEY, JSON.stringify(next));
  }

  function persistOrder(next: string[]) {
    setOrder(next);
    localStorage.setItem(ICON_ORDER_KEY, JSON.stringify(next));
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
      ...desktopItems.filter((i) => !i.parentId).map((i) => ({ id: i.id, name: i.name })),
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
  }

  function handlePersonalize() {
    setContextMenu(null);
    const settingsBody = CELESTIAL_BODIES.find((b) => b.id === "settings");
    if (settingsBody) onOpenApp(settingsBody);
  }

  function handleCreateFolder(parentId: string | null = null): string {
    setContextMenu(null);
    const siblingNames = desktopItems.filter((i) => (i.parentId ?? null) === parentId).map((i) => i.name);
    const existingNames = (parentId ? siblingNames : [...CELESTIAL_BODIES.map((b) => b.name), ...siblingNames]).map(
      (n) => n.toLowerCase()
    );
    const name = uniqueItemName("New folder", "", existingNames);
    const id = generateItemId("folder");
    const item: DesktopItemData = { id, kind: "folder", name, parentId: parentId ?? undefined };
    persistItems([...desktopItems, item]);
    if (!parentId) {
      persistOrder([...order, id]);
      setSelectedIds(new Set([id]));
      setRenamingId(id);
    }
    return id;
  }

  function handleCreateFile(parentId: string | null = null): string {
    setContextMenu(null);
    const siblingNames = desktopItems.filter((i) => (i.parentId ?? null) === parentId).map((i) => i.name);
    const existingNames = (parentId ? siblingNames : [...CELESTIAL_BODIES.map((b) => b.name), ...siblingNames]).map(
      (n) => n.toLowerCase()
    );
    const name = uniqueItemName("New Text Document", ".txt", existingNames);
    const id = generateItemId("file");
    const item: DesktopItemData = { id, kind: "file", name, parentId: parentId ?? undefined };
    persistItems([...desktopItems, item]);
    if (!parentId) {
      persistOrder([...order, id]);
      setSelectedIds(new Set([id]));
      setRenamingId(id);
    }
    return id;
  }

  function handleRenameSubmit(id: string, newNameRaw: string) {
    setRenamingId(null);
    const trimmed = newNameRaw.trim();
    if (!trimmed) return;
    persistItems(desktopItems.map((it) => (it.id === id ? { ...it, name: trimmed } : it)));
  }

  function handleDeleteItems(idsInput: string[]) {
    setIconContextMenu(null);
    const idSet = new Set(idsInput);
    // Cascade: deleting a folder also deletes everything nested inside it, at any depth
    // (fixed-point loop since a grandchild's parent may only get added to idSet on a later pass).
    let changed = true;
    while (changed) {
      changed = false;
      for (const it of desktopItems) {
        if (it.parentId && idSet.has(it.parentId) && !idSet.has(it.id)) {
          idSet.add(it.id);
          changed = true;
        }
      }
    }
    persistItems(desktopItems.filter((it) => !idSet.has(it.id)));
    persistOrder(order.filter((oid) => !idSet.has(oid)));
    const nextPositions = { ...positions };
    for (const id of idSet) delete nextPositions[id];
    persistPositions(nextPositions);
    for (const id of idSet) localStorage.removeItem(fileContentKey(id));
    setOpenViewerIds((prev) => prev.filter((vid) => !idSet.has(vid)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of idSet) next.delete(id);
      return next;
    });
  }

  /** Moves items into `targetFolderId` (or back to the desktop, if null). Folders can now be nested inside
   *  other folders — `isDescendantOf` blocks moving a folder into its own descendant (would create a cycle). */
  function moveItems(ids: string[], targetFolderId: string | null) {
    const movable = ids.filter((id) => {
      if (id === targetFolderId) return false;
      const it = desktopItemsById.get(id);
      if (!it) return false;
      if ((it.parentId ?? null) === targetFolderId) return false; // already there
      if (targetFolderId && it.kind === "folder" && isDescendantOf(targetFolderId, id, desktopItemsById)) return false;
      return true;
    });
    if (movable.length === 0) return;
    const movableSet = new Set(movable);
    persistItems(
      desktopItems.map((it) => (movableSet.has(it.id) ? { ...it, parentId: targetFolderId ?? undefined } : it))
    );
    if (targetFolderId) {
      persistOrder(order.filter((id) => !movableSet.has(id)));
    } else {
      persistOrder([...order.filter((id) => !movableSet.has(id)), ...movable]);
    }
    const nextPositions = { ...positions };
    for (const id of movable) delete nextPositions[id];
    persistPositions(nextPositions);
    setSelectedIds(new Set());
  }

  const desktopItemsById = useMemo(() => new Map(desktopItems.map((i) => [i.id, i])), [desktopItems]);

  // ---- Minimize (taskbar integration) ----
  function handleMinimizeViewer(id: string) {
    setMinimizedViewerIds((prev) => new Set(prev).add(id));
    setActiveWindowId((prev) => (prev === id ? null : prev));
  }

  useImperativeHandle(ref, () => ({
    toggleViewerMinimize(id: string) {
      setMinimizedViewerIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
          setOpenViewerIds((ids) => [...ids.filter((vid) => vid !== id), id]);
          setActiveWindowId(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
  }));

  const viewers: ViewerSummary[] = useMemo(
    () =>
      openViewerIds
        .map((id): ViewerSummary | null => {
          const item = desktopItemsById.get(id);
          if (!item) return null;
          return { id, name: item.name, kind: item.kind, minimized: minimizedViewerIds.has(id) };
        })
        .filter((v): v is ViewerSummary => v !== null),
    [openViewerIds, desktopItemsById, minimizedViewerIds]
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

  const entries: Entry[] = order
    .map((id): Entry | null => {
      const body = CELESTIAL_BODIES.find((b) => b.id === id);
      if (body) {
        return { id: body.id, name: body.name, color: body.color, icon: STUDIO_ICONS[body.id], kind: "studio", body };
      }
      const item = desktopItemsById.get(id);
      if (item && !item.parentId) {
        return {
          id: item.id,
          name: item.name,
          color: item.kind === "folder" ? FOLDER_COLOR : FILE_COLOR,
          icon: item.kind === "folder" ? Folder : Document,
          kind: item.kind,
        };
      }
      return null;
    })
    .filter((e): e is Entry => e !== null);

  // ---- Delete key ----
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Delete") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (renamingId || selectedIds.size === 0 || activeWindowId !== null) return;
      const deletable = Array.from(selectedIds).filter((id) => desktopItemsById.has(id));
      if (deletable.length > 0) handleDeleteItems(deletable);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds, renamingId, desktopItems, order, positions, desktopItemsById, activeWindowId]);

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

  // ---- Drag (reposition, or drop onto a folder to move files into it) ----
  function hitTestFolder(clientX: number, clientY: number, excludeIds: string[]): string | null {
    for (const entry of entries) {
      if (entry.kind !== "folder" || excludeIds.includes(entry.id)) continue;
      const el = iconRefs.current[entry.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return entry.id;
      }
    }
    return null;
  }

  function handleIconDragStart(id: string) {
    setActiveWindowId(null);
    const ids = selectedIds.has(id) && selectedIds.size > 1 ? Array.from(selectedIds) : [id];
    if (ids.length === 1) {
      setSelectedIds(new Set(ids));
      lastSelectedIndexRef.current = entries.findIndex((en) => en.id === id);
    }
    setDragState({ ids, dx: 0, dy: 0, overFolderId: null });
  }

  function handleIconDragMove(dx: number, dy: number, clientX: number, clientY: number) {
    setDragState((prev) => (prev ? { ...prev, dx, dy, overFolderId: hitTestFolder(clientX, clientY, prev.ids) } : prev));
  }

  function handleIconDragEnd(dx: number, dy: number, clientX: number, clientY: number) {
    setDragState((prev) => {
      if (!prev) return null;
      const dropFolderId = hitTestFolder(clientX, clientY, prev.ids);
      if (dropFolderId) {
        moveItems(prev.ids, dropFolderId);
      } else if (!autoArrange) {
        const nextPositions = { ...positions };
        for (const id of prev.ids) {
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
      return null;
    });
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
          const preview = dragState?.ids.includes(entry.id) ? { dx: dragState.dx, dy: dragState.dy } : null;
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
                } else {
                  setActiveWindowId(entry.id);
                  setMinimizedViewerIds((prev) => {
                    if (!prev.has(entry.id)) return prev;
                    const next = new Set(prev);
                    next.delete(entry.id);
                    return next;
                  });
                  setOpenViewerIds((prev) =>
                    prev.includes(entry.id) ? [...prev.filter((vid) => vid !== entry.id), entry.id] : [...prev, entry.id]
                  );
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedIds((prev) => (prev.has(entry.id) ? prev : new Set([entry.id])));
                if (entry.kind === "studio") {
                  setPinMenu({ x: e.clientX, y: e.clientY, studioId: entry.id as StudioId });
                } else {
                  setIconContextMenu({ x: e.clientX, y: e.clientY, itemId: entry.id });
                }
              }}
              position={autoArrange ? null : positions[entry.id] ?? defaultGridPosition(index)}
              previewOffset={preview}
              dropHighlight={dragState?.overFolderId === entry.id}
              onDragStart={() => handleIconDragStart(entry.id)}
              onDragMove={handleIconDragMove}
              onDragEnd={handleIconDragEnd}
              renaming={renamingId === entry.id}
              onRenameSubmit={(name) => handleRenameSubmit(entry.id, name)}
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

      {openViewerIds.map((id, idx) => {
        const item = desktopItemsById.get(id);
        if (!item) return null;
        const minimized = minimizedViewerIds.has(id);
        if (item.kind === "folder") {
          return (
            <div key={id} style={minimized ? { display: "none" } : undefined}>
              <FileManager
                rootFolderId={id}
                items={desktopItems}
                cascadeIndex={idx}
                isActive={activeWindowId === id}
                taskbarReserve={taskbarReserve}
                onClose={() => setOpenViewerIds((prev) => prev.filter((vid) => vid !== id))}
                onMinimize={() => handleMinimizeViewer(id)}
                onFocus={() => {
                  setOpenViewerIds((prev) => [...prev.filter((vid) => vid !== id), id]);
                  setActiveWindowId(id);
                }}
                onCreateFolder={handleCreateFolder}
                onCreateFile={handleCreateFile}
                onRename={handleRenameSubmit}
                onDelete={handleDeleteItems}
                onMove={moveItems}
                onOpenFile={(fileId) => {
                  setActiveWindowId(fileId);
                  setMinimizedViewerIds((prev) => {
                    if (!prev.has(fileId)) return prev;
                    const next = new Set(prev);
                    next.delete(fileId);
                    return next;
                  });
                  setOpenViewerIds((prev) =>
                    prev.includes(fileId) ? [...prev.filter((vid) => vid !== fileId), fileId] : [...prev, fileId]
                  );
                }}
              />
            </div>
          );
        }
        return (
          <div key={id} style={minimized ? { display: "none" } : undefined}>
          <FileEditorWindow
            item={item}
            cascadeIndex={idx}
            taskbarReserve={taskbarReserve}
            onClose={() => setOpenViewerIds((prev) => prev.filter((vid) => vid !== id))}
            onMinimize={() => handleMinimizeViewer(id)}
            onFocus={() => {
              setOpenViewerIds((prev) => [...prev.filter((vid) => vid !== id), id]);
              setActiveWindowId(id);
            }}
          />
          </div>
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
          onCreateFolder={() => handleCreateFolder()}
          onCreateFile={() => handleCreateFile()}
          onClose={() => setContextMenu(null)}
        />
      )}

      {iconContextMenu && (
        <IconContextMenu
          x={iconContextMenu.x}
          y={iconContextMenu.y}
          count={selectedIds.has(iconContextMenu.itemId) ? Math.max(selectedIds.size, 1) : 1}
          onRename={() => {
            setRenamingId(iconContextMenu.itemId);
            setIconContextMenu(null);
          }}
          onDelete={() => {
            const ids =
              selectedIds.has(iconContextMenu.itemId) && selectedIds.size > 1
                ? Array.from(selectedIds)
                : [iconContextMenu.itemId];
            handleDeleteItems(ids);
          }}
          onClose={() => setIconContextMenu(null)}
        />
      )}

      {pinMenu && (
        <PinContextMenu
          x={pinMenu.x}
          y={pinMenu.y}
          pinned={pinnedIds.includes(pinMenu.studioId)}
          onTogglePin={() => {
            onTogglePin(pinMenu.studioId);
            setPinMenu(null);
          }}
          onClose={() => setPinMenu(null)}
        />
      )}
    </div>
  );
});

export default TraditionalShell;
