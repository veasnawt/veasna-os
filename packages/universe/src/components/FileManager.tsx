import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Folder } from "@veasnawt/vicons";
import { DesktopItemData, FOLDER_COLOR, isDescendantOf } from "../utils/desktopItems";
import { listFolder, downloadFile, rawFileUrl } from "../utils/filesApi";
import { getFileIcon, getFileColor, getFileKind } from "../utils/fileTypes";
import { flattenDroppedItems, uploadDroppedFiles, isExternalFileDrag } from "../utils/dropFiles";
import FloatingWindow, { FloatingRect } from "./FloatingWindow";
import DragGhost from "./DragGhost";

// Must clear the browser/OS's own double-click threshold (typically ~300-500ms) so a genuine fast
// double-click (open) never gets misread as two separate rename-triggering clicks.
const RENAME_MIN_GAP = 450;

interface ClipboardState {
  paths: string[];
  mode: "cut" | "copy";
}

/** Result of a drop hit-test — `windowId` is set only when the target is a *different* open window
 *  (vs one of this window's own tiles/breadcrumbs, a desktop folder icon, or the Desktop root). */
interface DropTarget {
  targetPath: string;
  folderIconId: string | null;
  windowId: string | null;
}

interface FileManagerProps {
  rootPath: string;
  cascadeIndex: number;
  zIndex: number;
  /** Whether this window currently owns keyboard shortcuts like Delete (only one surface should at a time). */
  isActive: boolean;
  taskbarReserve: number;
  minimized?: boolean;
  onClose: () => void;
  onFocus: () => void;
  onMinimize: () => void;
  onCreateFolder: (parentPath: string | null) => Promise<string>;
  onCreateFile: (parentPath: string | null) => Promise<string>;
  onRename: (path: string, name: string) => Promise<void>;
  onDelete: (paths: string[]) => Promise<void>;
  onMove: (paths: string[], targetFolderPath: string | null) => Promise<void>;
  onOpenFile: (path: string, name: string) => void;
  /** Right-click "Edit" for a file whose default open action ISN'T the plain-text editor (currently
   *  just .html/.htm, which `onOpenFile` sends to the Browser studio instead) — forces it open there. */
  onEditFile: (path: string, name: string) => void;
  /** Reports this window's screen rect whenever it changes (drag/resize/maximize) — lets the parent
   *  hit-test drags from elsewhere (the Desktop, or another window) against this window. */
  onRectChange?: (rect: FloatingRect) => void;
  /** Reports which folder this window is CURRENTLY browsing (not just where it was opened) — that's
   *  the real drop target when something is dragged into this window from elsewhere. */
  onCurrentPathChange?: (path: string) => void;
  /** Increments whenever a move/copy from OUTSIDE this window (another window, the Desktop, or a
   *  desktop-initiated paste) lands in the folder this window is currently browsing — this window
   *  can't otherwise know its listing went stale, since it only fetches on its own `currentPath` changes. */
  refreshToken?: number;
  /** Falls back to this (desktop folder icons / other open windows / the Desktop root) whenever a
   *  drag inside this window lands outside its own tiles/breadcrumbs. */
  resolveExternalDropTarget: (clientX: number, clientY: number) => DropTarget;
  /** Fired while dragging within this window, with the id of whichever OTHER open window the cursor
   *  is currently over (or null) — lets that window highlight itself as the pending drop target. */
  onExternalHoverChange?: (windowId: string | null) => void;
  /** True while a drag from elsewhere (Desktop or another window) is currently hovering this window. */
  isExternalDropTarget?: boolean;
  clipboard: ClipboardState | null;
  onCut: (paths: string[]) => void;
  onCopy: (paths: string[]) => void;
  onClearClipboard: () => void;
  onPaste: (targetPath: string) => Promise<void>;
  /** Ctrl+Z — the undo stack itself is owned by TraditionalShell (shared across the Desktop and
   *  every open window, matching a real OS's single undo history), this just triggers it. */
  onUndo: () => void;
  /** Opens the Terminal studio `cd`'d into the given `.desktop`-relative path. */
  onOpenTerminal: (desktopRelPath: string) => void;
  /** Right-click "Properties" — owned by TraditionalShell since the Properties window shares its
   *  z-index counter/floating-window layer with everything else in the OS. */
  onOpenProperties: (path: string, kind: "folder" | "file", name: string) => void;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function fetchSortedChildren(path: string): Promise<DesktopItemData[]> {
  const entries = await listFolder(path);
  const items: DesktopItemData[] = entries.map((e) => ({ path: e.path, kind: e.kind, name: e.name }));
  items.sort((a, b) => (a.kind !== b.kind ? (a.kind === "folder" ? -1 : 1) : a.name.localeCompare(b.name)));
  return items;
}

function MenuDivider() {
  return <div className="my-1 h-px bg-[var(--os-border)]" />;
}

export default function FileManager({
  rootPath,
  cascadeIndex,
  zIndex,
  isActive,
  taskbarReserve,
  minimized,
  onClose,
  onFocus,
  onMinimize,
  onCreateFolder,
  onCreateFile,
  onRename,
  onDelete,
  onMove,
  onOpenFile,
  onEditFile,
  onOpenProperties,
  onRectChange,
  onCurrentPathChange,
  refreshToken,
  resolveExternalDropTarget,
  onExternalHoverChange,
  isExternalDropTarget,
  clipboard,
  onCut,
  onCopy,
  onClearClipboard,
  onPaste,
  onUndo,
  onOpenTerminal,
}: FileManagerProps) {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [children, setChildren] = useState<DesktopItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [itemMenu, setItemMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  // Cursor position while `dragIds` is active — drives the portaled `DragGhost` (see the render below
  // for why the dragged tile itself can't just show a translate-following visual: this window's own
  // stacking context can't out-paint another window portaled above it).
  const [dragPointer, setDragPointer] = useState<{ x: number; y: number } | null>(null);
  const tileRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const crumbRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastSelectedIndexRef = useRef<number | null>(null);
  // Rubber-band multi-select (click-drag over empty space) — mirrors the Desktop's own marquee
  // select exactly, just anchored to this window's scrolling tile-grid div instead of the (non-
  // scrolling) desktop container, so the coordinate math stays correct regardless of scroll position.
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeOriginRef = useRef<{ startX: number; startY: number; dragging: boolean; additive: boolean; base: Set<string> } | null>(
    null
  );
  const gridRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  // Click-to-rename (like Explorer/Finder): clicking an already-(sole-)selected tile's NAME LABEL a
  // deliberate beat after the click that selected it fires immediately — compares against the time of
  // this same tile's last label click rather than scheduling-then-waiting, so success/failure is
  // immediate instead of needing an extra pause after the click to find out which one happened.
  const lastLabelClicksRef = useRef<Record<string, number>>({});

  useEffect(() => {
    onCurrentPathChange?.(currentPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  useEffect(() => {
    if (refreshToken === undefined) return;
    refreshChildren();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchSortedChildren(currentPath)
      .then((items) => {
        if (!cancelled) setChildren(items);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPath]);

  async function refreshChildren() {
    try {
      setChildren(await fetchSortedChildren(currentPath));
    } catch (err) {
      setBanner(errMessage(err));
    }
  }

  // ---- Native OS file drop (drag from the real Mac/Windows/Linux desktop into this folder) ----
  const [isExternalDragOver, setIsExternalDragOver] = useState(false);
  // dragenter/dragleave fire on every child-element boundary crossing too, not just the window's
  // outer edge — a plain boolean flag would flicker on/off as the pointer passes over tiles. A nesting
  // counter (inc on enter, dec on leave, only clear the highlight at 0) is the standard fix.
  const dragDepthRef = useRef(0);

  function handleExternalDragEnter(e: React.DragEvent) {
    if (!isExternalFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsExternalDragOver(true);
  }

  function handleExternalDragOver(e: React.DragEvent) {
    if (!isExternalFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function handleExternalDragLeave(e: React.DragEvent) {
    if (!isExternalFileDrag(e.dataTransfer)) return;
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsExternalDragOver(false);
  }

  async function handleExternalDrop(e: React.DragEvent) {
    if (!isExternalFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsExternalDragOver(false);
    const dropped = await flattenDroppedItems(e.dataTransfer);
    if (dropped.length === 0) return;
    try {
      const existingLower = children.map((c) => c.name.toLowerCase());
      const { errors } = await uploadDroppedFiles(dropped, currentPath, existingLower);
      await refreshChildren();
      if (errors.length > 0) setBanner(errors.map((err) => `${err.name}: ${err.message}`).join("; "));
    } catch (err) {
      setBanner(errMessage(err));
    }
  }

  useEffect(() => {
    if (!menu && !itemMenu) return;
    function handlePointerDown(e: MouseEvent) {
      if (menu && menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
      if (itemMenu && itemMenuRef.current && !itemMenuRef.current.contains(e.target as Node)) setItemMenu(null);
    }
    // Capture phase, not bubble — several per-tile mousedown handlers in this file (drag-to-move,
    // the marquee) call `stopPropagation()` for unrelated reasons (so a tile-drag doesn't also start
    // a rubber-band select, etc.), which would otherwise silently stop a bubble-phase listener here
    // from ever seeing the click at all. Capture fires BEFORE any of those handlers get a chance to
    // stop anything, so this always sees every mousedown regardless of what happens afterward.
    document.addEventListener("mousedown", handlePointerDown, true);
    return () => document.removeEventListener("mousedown", handlePointerDown, true);
  }, [menu, itemMenu]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  async function handleDelete(paths: string[]) {
    setItemMenu(null);
    try {
      await onDelete(paths);
      await refreshChildren();
      setSelectedIds(new Set());
    } catch (err) {
      setBanner(errMessage(err));
    }
  }

  async function handlePaste() {
    setMenu(null);
    try {
      await onPaste(currentPath);
      await refreshChildren();
    } catch (err) {
      setBanner(errMessage(err));
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isActive) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (renamingId) return;
      if (e.key === "Delete") {
        if (selectedIds.size === 0) return;
        handleDelete(Array.from(selectedIds));
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "c" || e.key === "C")) {
        if (selectedIds.size > 0) onCopy(Array.from(selectedIds));
        return;
      }
      if (mod && (e.key === "x" || e.key === "X")) {
        if (selectedIds.size > 0) onCut(Array.from(selectedIds));
        return;
      }
      if (mod && (e.key === "v" || e.key === "V")) {
        if (clipboard) handlePaste();
        return;
      }
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        onUndo();
        return;
      }
      if (e.key === "Escape") onClearClipboard();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, renamingId, isActive, clipboard, currentPath, onUndo]);

  const breadcrumb = useMemo(() => {
    if (!currentPath) return [];
    let acc = "";
    return currentPath.split("/").map((seg) => {
      acc = acc ? `${acc}/${seg}` : seg;
      return { path: acc, name: seg };
    });
  }, [currentPath]);

  const title = currentPath === "" ? "Desktop" : (breadcrumb[breadcrumb.length - 1]?.name ?? "Desktop");

  function handleSelect(id: string, index: number, e: React.MouseEvent) {
    if (e.shiftKey && lastSelectedIndexRef.current !== null) {
      const [a, b] = [lastSelectedIndexRef.current, index].sort((x, y) => x - y);
      setSelectedIds(new Set(children.slice(a, b + 1).map((c) => c.path)));
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

  function handleOpen(item: DesktopItemData) {
    if (item.kind === "folder") {
      setCurrentPath(item.path);
      setSelectedIds(new Set());
      lastSelectedIndexRef.current = null;
    } else {
      onOpenFile(item.path, item.name);
    }
  }

  function startRename(id: string) {
    setRenamingId(id);
    setItemMenu(null);
  }

  async function commitRename(value: string) {
    const id = renamingId;
    setRenamingId(null);
    if (!id) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    try {
      await onRename(id, trimmed);
      await refreshChildren();
    } catch (err) {
      setBanner(errMessage(err));
    }
  }

  async function handleCreateFolderHere() {
    setMenu(null);
    try {
      const path = await onCreateFolder(currentPath);
      await refreshChildren();
      setSelectedIds(new Set([path]));
      startRename(path);
    } catch (err) {
      setBanner(errMessage(err));
    }
  }

  async function handleCreateFileHere() {
    setMenu(null);
    try {
      const path = await onCreateFile(currentPath);
      await refreshChildren();
      setSelectedIds(new Set([path]));
    } catch (err) {
      setBanner(errMessage(err));
    }
  }

  function handleTileMouseDown(id: string, e: React.MouseEvent) {
    if (e.button !== 0 || renamingId) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const idsToDrag = selectedIds.has(id) && selectedIds.size > 1 ? Array.from(selectedIds) : [id];
    let dragging = false;
    let currentTarget: DropTarget | null = null;

    // A folder can never be dropped onto itself or one of its own descendants — real fs.rename
    // would fail badly (or worse) for that, so this is checked up front for every candidate target.
    function wouldCycle(targetPath: string): boolean {
      return idsToDrag.some((d) => isDescendantOf(targetPath, d));
    }

    /** This window's own tiles/breadcrumbs first; anything else (another window, a desktop folder
     *  icon, or the bare Desktop) falls back to the shared resolver passed down from the parent. */
    function hitTest(clientX: number, clientY: number): { hit: DropTarget; internal: boolean } | null {
      for (const child of children) {
        if (child.kind !== "folder" || idsToDrag.includes(child.path) || wouldCycle(child.path)) continue;
        const el = tileRefs.current[child.path];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
          return { hit: { targetPath: child.path, folderIconId: null, windowId: null }, internal: true };
        }
      }
      for (const crumb of breadcrumb) {
        if (idsToDrag.includes(crumb.path) || crumb.path === currentPath || wouldCycle(crumb.path)) continue;
        const el = crumbRefs.current[crumb.path];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
          return { hit: { targetPath: crumb.path, folderIconId: null, windowId: null }, internal: true };
        }
      }
      const rootEl = crumbRefs.current["__root__"];
      if (rootEl && currentPath !== "" && !wouldCycle("")) {
        const r = rootEl.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
          return { hit: { targetPath: "", folderIconId: null, windowId: null }, internal: true };
        }
      }
      const external = resolveExternalDropTarget(clientX, clientY);
      if (wouldCycle(external.targetPath)) return null;
      return { hit: external, internal: false };
    }

    function handleMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) > 4) {
        dragging = true;
        if (idsToDrag.length === 1) setSelectedIds(new Set(idsToDrag));
        setDragIds(idsToDrag);
      }
      if (dragging) {
        setDragPointer({ x: ev.clientX, y: ev.clientY });
        const result = hitTest(ev.clientX, ev.clientY);
        currentTarget = result?.hit ?? null;
        setDropTargetId(result?.internal ? result.hit.targetPath : null);
        onExternalHoverChange?.(!result?.internal ? (result?.hit.windowId ?? null) : null);
      }
    }

    function handleUp() {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      if (dragging && currentTarget) {
        onMove(idsToDrag, currentTarget.targetPath)
          .then(() => refreshChildren())
          .catch((err) => setBanner(errMessage(err)));
      }
      setDragIds(null);
      setDropTargetId(null);
      setDragPointer(null);
      onExternalHoverChange?.(null);
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  /** Rubber-band select over empty space within the tile grid — `handleTileMouseDown` already calls
   *  `stopPropagation()`, so this only ever fires for genuinely empty space, never a tile itself. */
  function handleGridMouseDown(e: React.MouseEvent) {
    if (e.button !== 0 || renamingId) return;
    const rect = gridRef.current?.getBoundingClientRect();
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
        for (const [id, el] of Object.entries(tileRefs.current)) {
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
      if (origin?.dragging) {
        // The browser still fires a trailing "click" right after this mouseup, targeted at whatever
        // element the cursor happens to be resting over — often one of the tiles the marquee just
        // selected. Left alone, that tile's own onClick would collapse the multi-selection down to
        // just itself. Swallowing exactly this one click in the capture phase (before it can reach
        // any tile's or this window's own onClick) fixes that without affecting any later, real click.
        const swallowNextClick = (e: MouseEvent) => e.stopPropagation();
        window.addEventListener("click", swallowNextClick, { capture: true, once: true });
      } else if (!origin?.additive) {
        setSelectedIds(new Set());
        lastSelectedIndexRef.current = null;
      }
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  return (
    <FloatingWindow
      title={title}
      icon={Folder}
      color={FOLDER_COLOR}
      cascadeIndex={cascadeIndex}
      zIndex={zIndex}
      defaultWidth={520}
      defaultHeight={420}
      taskbarReserve={taskbarReserve}
      minimized={minimized}
      onRectChange={onRectChange}
      onClose={onClose}
      onFocus={onFocus}
      onMinimize={onMinimize}
    >
      <div
        className={`relative flex h-full flex-col transition ${
          isExternalDropTarget ? "outline outline-2 -outline-offset-2 outline-sky-300" : ""
        } ${isExternalDragOver ? "outline outline-2 -outline-offset-2 outline-dashed outline-emerald-400" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedIds(new Set());
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSelectedIds(new Set());
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        onDragEnter={handleExternalDragEnter}
        onDragOver={handleExternalDragOver}
        onDragLeave={handleExternalDragLeave}
        onDrop={handleExternalDrop}
      >
        {isExternalDragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-emerald-950/40">
            <span className="rounded-full bg-emerald-500/90 px-4 py-1.5 text-xs font-semibold text-white shadow-lg">
              Drop to add files here
            </span>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--os-border)] px-3 py-1.5 text-[11px]">
          <button
            ref={(el) => {
              crumbRefs.current["__root__"] = el;
            }}
            onClick={() => {
              setCurrentPath("");
              setSelectedIds(new Set());
            }}
            className={`shrink-0 rounded px-1.5 py-0.5 font-medium transition hover:bg-[var(--os-border-strong)] ${
              currentPath === "" ? "text-[var(--os-text)]" : "text-[var(--os-text-muted)]"
            } ${dropTargetId === "" ? "bg-sky-400/30 outline outline-1 outline-sky-300" : ""}`}
          >
            Desktop
          </button>
          {breadcrumb.map((crumb) => (
            <React.Fragment key={crumb.path}>
              <span className="text-[var(--os-text-muted)]">/</span>
              <button
                ref={(el) => {
                  crumbRefs.current[crumb.path] = el;
                }}
                onClick={() => {
                  setCurrentPath(crumb.path);
                  setSelectedIds(new Set());
                }}
                className={`shrink-0 truncate rounded px-1.5 py-0.5 font-medium transition hover:bg-[var(--os-border-strong)] ${
                  crumb.path === currentPath ? "text-[var(--os-text)]" : "text-[var(--os-text-muted)]"
                } ${dropTargetId === crumb.path ? "bg-sky-400/30 outline outline-1 outline-sky-300" : ""}`}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        {banner && (
          <div className="flex shrink-0 items-center gap-2 border-b border-rose-500/30 bg-rose-950/60 px-3 py-1.5 text-[11px] text-rose-200">
            <span className="flex-1">{banner}</span>
            <button onClick={() => setBanner(null)} className="text-rose-300 transition hover:text-white">
              ×
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {loadError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-[var(--os-text-muted)]">
              <span>This folder no longer exists.</span>
              <button
                onClick={() => setCurrentPath("")}
                className="rounded bg-[var(--os-border-strong)] px-3 py-1.5 text-[var(--os-text)] transition hover:bg-[var(--os-border)]"
              >
                Go to Desktop
              </button>
            </div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center text-xs text-[var(--os-text-muted)]">Loading…</div>
          ) : children.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-xs text-[var(--os-text-muted)]">
              This folder is empty.
              <br />
              Right-click for New Folder / New Text File.
            </div>
          ) : (
            <div
              ref={gridRef}
              // `h-full` matters here, not just cosmetic — without it this div (a `flex-wrap`
              // container) only sizes to fit its tiles, so a marquee mousedown starting in the
              // visually-empty space below/right of the last row would miss it entirely and land on
              // the scrollable parent instead, silently never starting a drag.
              className="relative flex h-full w-full flex-wrap content-start gap-1"
              onMouseDown={handleGridMouseDown}
              onClick={(e) => e.stopPropagation()}
            >
              {marqueeRect && (
                <div
                  className="pointer-events-none absolute rounded-sm border border-sky-300 bg-sky-400/20"
                  style={{ left: marqueeRect.x, top: marqueeRect.y, width: marqueeRect.w, height: marqueeRect.h }}
                />
              )}
              {children.map((child, index) => {
                const isDragging = dragIds?.includes(child.path);
                const isDropTarget = dropTargetId === child.path;
                const isCut = clipboard?.mode === "cut" && clipboard.paths.includes(child.path);
                return (
                  <button
                    key={child.path}
                    ref={(el) => {
                      tileRefs.current[child.path] = el;
                    }}
                    onMouseDown={(e) => handleTileMouseDown(child.path, e)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (renamingId !== child.path) handleSelect(child.path, index, e);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      delete lastLabelClicksRef.current[child.path];
                      if (renamingId !== child.path) handleOpen(child);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedIds((prev) => (prev.has(child.path) ? prev : new Set([child.path])));
                      setItemMenu({ x: e.clientX, y: e.clientY, itemId: child.path });
                    }}
                    className={`flex w-20 flex-col items-center gap-1 rounded p-2 text-center transition ${
                      isDragging || isCut ? "opacity-40" : ""
                    } ${
                      isDropTarget
                        ? "bg-sky-400/30 outline outline-2 outline-sky-300"
                        : selectedIds.has(child.path)
                          ? "bg-sky-500/25 outline outline-1 outline-sky-400/50"
                          : "hover:bg-white/[0.06]"
                    }`}
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${child.kind === "folder" ? FOLDER_COLOR : getFileColor(child.name)} 30%, rgba(6, 8, 16, 0.72))`,
                        color: child.kind === "folder" ? FOLDER_COLOR : getFileColor(child.name),
                      }}
                    >
                      {child.kind === "folder" ? (
                        <Folder size={18} />
                      ) : child.kind === "file" && getFileKind(child.name) === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element -- arbitrary sandboxed local files
                        <img src={rawFileUrl(child.path)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        React.createElement(getFileIcon(child.name), { size: 18 })
                      )}
                    </span>
                    {renamingId === child.path ? (
                      <input
                        ref={renameInputRef}
                        defaultValue={child.name}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onBlur={(e) => commitRename(e.target.value)}
                        className="w-full rounded bg-[var(--os-surface-strong)] px-1 py-0.5 text-center text-[10px] font-medium text-[var(--os-text)] outline outline-1 outline-[var(--os-accent-border)]"
                      />
                    ) : (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          if (e.ctrlKey || e.metaKey || e.shiftKey) {
                            handleSelect(child.path, index, e);
                            return;
                          }
                          const now = Date.now();
                          const gap = now - (lastLabelClicksRef.current[child.path] ?? 0);
                          lastLabelClicksRef.current[child.path] = now;
                          const isSoleSelection = selectedIds.has(child.path) && selectedIds.size <= 1;
                          if (isSoleSelection && gap > RENAME_MIN_GAP) {
                            startRename(child.path);
                          } else if (!isSoleSelection) {
                            handleSelect(child.path, index, e);
                          }
                        }}
                        className="w-full truncate text-[10px] font-medium text-[var(--os-text)]"
                      >
                        {child.name}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {menu &&
        createPortal(
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              left: Math.min(menu.x, window.innerWidth - 190),
              top: Math.min(menu.y, window.innerHeight - 190),
              zIndex: 9500,
            }}
            className="fixed w-[180px] rounded-xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-1.5 shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
          >
            <button
              onClick={handleCreateFolderHere}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
            >
              New Folder
            </button>
            <button
              onClick={handleCreateFileHere}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
            >
              New Text File
            </button>
            <MenuDivider />
            <button
              onClick={handlePaste}
              disabled={!clipboard}
              className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
                clipboard
                  ? "text-[var(--os-text)] hover:bg-[var(--os-border-strong)]"
                  : "cursor-default text-[var(--os-text-muted)] opacity-50"
              }`}
            >
              Paste
            </button>
            <MenuDivider />
            <button
              onClick={() => {
                setMenu(null);
                onOpenTerminal(currentPath);
              }}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
            >
              Open in Terminal
            </button>
          </div>,
          document.body
        )}

      {itemMenu &&
        createPortal(
          <div
            ref={itemMenuRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              left: Math.min(itemMenu.x, window.innerWidth - 180),
              top: Math.min(itemMenu.y, window.innerHeight - 180),
              zIndex: 9500,
            }}
            className="fixed w-[170px] rounded-xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-1.5 shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
          >
            <button
              onClick={() => {
                const ids =
                  selectedIds.has(itemMenu.itemId) && selectedIds.size > 1
                    ? Array.from(selectedIds)
                    : [itemMenu.itemId];
                onCut(ids);
                setItemMenu(null);
              }}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
            >
              Cut
            </button>
            <button
              onClick={() => {
                const ids =
                  selectedIds.has(itemMenu.itemId) && selectedIds.size > 1
                    ? Array.from(selectedIds)
                    : [itemMenu.itemId];
                onCopy(ids);
                setItemMenu(null);
              }}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
            >
              Copy
            </button>
            <MenuDivider />
            {(!selectedIds.has(itemMenu.itemId) || selectedIds.size <= 1) && (
              <button
                onClick={() => startRename(itemMenu.itemId)}
                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
              >
                Rename
              </button>
            )}
            {(!selectedIds.has(itemMenu.itemId) || selectedIds.size <= 1) &&
              children.find((c) => c.path === itemMenu.itemId)?.kind === "file" &&
              getFileKind(children.find((c) => c.path === itemMenu.itemId)!.name) === "html" && (
                <button
                  onClick={() => {
                    const item = children.find((c) => c.path === itemMenu.itemId);
                    if (item) onEditFile(item.path, item.name);
                    setItemMenu(null);
                  }}
                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
                >
                  Edit
                </button>
              )}
            {(!selectedIds.has(itemMenu.itemId) || selectedIds.size <= 1) &&
              children.find((c) => c.path === itemMenu.itemId)?.kind === "file" && (
                <button
                  onClick={() => {
                    const item = children.find((c) => c.path === itemMenu.itemId);
                    if (item) downloadFile(item.path, item.name);
                    setItemMenu(null);
                  }}
                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
                >
                  Download to computer
                </button>
              )}
            <button
              onClick={() => {
                const ids =
                  selectedIds.has(itemMenu.itemId) && selectedIds.size > 1
                    ? Array.from(selectedIds)
                    : [itemMenu.itemId];
                handleDelete(ids);
              }}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-400 transition hover:bg-[var(--os-border-strong)]"
            >
              {selectedIds.has(itemMenu.itemId) && selectedIds.size > 1 ? `Delete ${selectedIds.size} items` : "Delete"}
            </button>
            {(!selectedIds.has(itemMenu.itemId) || selectedIds.size <= 1) && (
              <>
                <MenuDivider />
                <button
                  onClick={() => {
                    const item = children.find((c) => c.path === itemMenu.itemId);
                    if (item) onOpenProperties(item.path, item.kind, item.name);
                    setItemMenu(null);
                  }}
                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
                >
                  Properties
                </button>
              </>
            )}
          </div>,
          document.body
        )}

      {dragIds &&
        dragIds.length > 0 &&
        dragPointer &&
        (() => {
          const first = children.find((c) => c.path === dragIds[0]);
          if (!first) return null;
          return (
            <DragGhost
              x={dragPointer.x}
              y={dragPointer.y}
              label={dragIds.length > 1 ? `${dragIds.length} items` : first.name}
              color={first.kind === "folder" ? FOLDER_COLOR : getFileColor(first.name)}
              icon={first.kind === "folder" ? Folder : getFileIcon(first.name)}
              count={dragIds.length}
            />
          );
        })()}
    </FloatingWindow>
  );
}
