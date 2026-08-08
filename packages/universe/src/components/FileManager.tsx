import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Folder, Document } from "@veasnawt/vicons";
import { DesktopItemData, FOLDER_COLOR, FILE_COLOR } from "../utils/desktopItems";
import FloatingWindow from "./FloatingWindow";

interface FileManagerProps {
  rootFolderId: string;
  items: DesktopItemData[];
  cascadeIndex: number;
  /** Whether this window currently owns keyboard shortcuts like Delete (only one surface should at a time). */
  isActive: boolean;
  taskbarReserve: number;
  onClose: () => void;
  onFocus: () => void;
  onMinimize: () => void;
  onCreateFolder: (parentId: string | null) => string;
  onCreateFile: (parentId: string | null) => string;
  onRename: (id: string, name: string) => void;
  onDelete: (ids: string[]) => void;
  onMove: (ids: string[], targetFolderId: string | null) => void;
  onOpenFile: (id: string) => void;
}

export default function FileManager({
  rootFolderId,
  items,
  cascadeIndex,
  isActive,
  taskbarReserve,
  onClose,
  onFocus,
  onMinimize,
  onCreateFolder,
  onCreateFile,
  onRename,
  onDelete,
  onMove,
  onOpenFile,
}: FileManagerProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(rootFolderId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [itemMenu, setItemMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const tileRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const crumbRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastSelectedIndexRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menu && !itemMenu) return;
    function handlePointerDown(e: MouseEvent) {
      if (menu && menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
      if (itemMenu && itemMenuRef.current && !itemMenuRef.current.contains(e.target as Node)) setItemMenu(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menu, itemMenu]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Delete") return;
      if (!isActive) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (renamingId || selectedIds.size === 0) return;
      onDelete(Array.from(selectedIds));
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds, renamingId, onDelete, isActive]);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const breadcrumb = useMemo(() => {
    const chain: DesktopItemData[] = [];
    let cur = currentFolderId ? itemsById.get(currentFolderId) : undefined;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? itemsById.get(cur.parentId) : undefined;
    }
    return chain;
  }, [currentFolderId, itemsById]);

  const children = useMemo(() => {
    return items
      .filter((i) => (i.parentId ?? null) === currentFolderId)
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [items, currentFolderId]);

  const currentFolder = currentFolderId ? itemsById.get(currentFolderId) : null;
  const title = currentFolder ? currentFolder.name : "Desktop";

  function handleSelect(id: string, index: number, e: React.MouseEvent) {
    if (e.shiftKey && lastSelectedIndexRef.current !== null) {
      const [a, b] = [lastSelectedIndexRef.current, index].sort((x, y) => x - y);
      setSelectedIds(new Set(children.slice(a, b + 1).map((c) => c.id)));
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
      setCurrentFolderId(item.id);
      setSelectedIds(new Set());
      lastSelectedIndexRef.current = null;
    } else {
      onOpenFile(item.id);
    }
  }

  function startRename(id: string) {
    setRenamingId(id);
    setItemMenu(null);
  }

  function commitRename(value: string) {
    if (renamingId) {
      const trimmed = value.trim();
      if (trimmed) onRename(renamingId, trimmed);
    }
    setRenamingId(null);
  }

  function handleCreateFolderHere() {
    setMenu(null);
    const id = onCreateFolder(currentFolderId);
    setSelectedIds(new Set([id]));
    startRename(id);
  }

  function handleCreateFileHere() {
    setMenu(null);
    const id = onCreateFile(currentFolderId);
    setSelectedIds(new Set([id]));
  }

  function handleTileMouseDown(id: string, e: React.MouseEvent) {
    if (e.button !== 0 || renamingId) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const idsToDrag = selectedIds.has(id) && selectedIds.size > 1 ? Array.from(selectedIds) : [id];
    let dragging = false;
    let currentTarget: string | null = null;

    function hitTest(clientX: number, clientY: number): string | null {
      for (const child of children) {
        if (child.kind !== "folder" || idsToDrag.includes(child.id)) continue;
        const el = tileRefs.current[child.id];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return child.id;
      }
      for (const crumb of breadcrumb) {
        if (idsToDrag.includes(crumb.id) || crumb.id === currentFolderId) continue;
        const el = crumbRefs.current[crumb.id];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return crumb.id;
      }
      const rootEl = crumbRefs.current["__root__"];
      if (rootEl && currentFolderId !== null) {
        const r = rootEl.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return "__root__";
      }
      return null;
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
        currentTarget = hitTest(ev.clientX, ev.clientY);
        setDropTargetId(currentTarget);
      }
    }

    function handleUp() {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      if (dragging && currentTarget) {
        onMove(idsToDrag, currentTarget === "__root__" ? null : currentTarget);
      }
      setDragIds(null);
      setDropTargetId(null);
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
      defaultWidth={520}
      defaultHeight={420}
      taskbarReserve={taskbarReserve}
      onClose={onClose}
      onFocus={onFocus}
      onMinimize={onMinimize}
    >
      <div
        className="flex h-full flex-col"
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
      >
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--os-border)] px-3 py-1.5 text-[11px]">
          <button
            ref={(el) => {
              crumbRefs.current["__root__"] = el;
            }}
            onClick={() => {
              setCurrentFolderId(null);
              setSelectedIds(new Set());
            }}
            className={`shrink-0 rounded px-1.5 py-0.5 font-medium transition hover:bg-[var(--os-border-strong)] ${
              currentFolderId === null ? "text-[var(--os-text)]" : "text-[var(--os-text-muted)]"
            } ${dropTargetId === "__root__" ? "bg-sky-400/30 outline outline-1 outline-sky-300" : ""}`}
          >
            Desktop
          </button>
          {breadcrumb.map((crumb) => (
            <React.Fragment key={crumb.id}>
              <span className="text-[var(--os-text-muted)]">/</span>
              <button
                ref={(el) => {
                  crumbRefs.current[crumb.id] = el;
                }}
                onClick={() => {
                  setCurrentFolderId(crumb.id);
                  setSelectedIds(new Set());
                }}
                className={`shrink-0 truncate rounded px-1.5 py-0.5 font-medium transition hover:bg-[var(--os-border-strong)] ${
                  crumb.id === currentFolderId ? "text-[var(--os-text)]" : "text-[var(--os-text-muted)]"
                } ${dropTargetId === crumb.id ? "bg-sky-400/30 outline outline-1 outline-sky-300" : ""}`}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {children.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-xs text-[var(--os-text-muted)]">
              This folder is empty.
              <br />
              Right-click for New Folder / New Text File.
            </div>
          ) : (
            <div className="flex flex-wrap content-start gap-1">
              {children.map((child, index) => {
                const isDragging = dragIds?.includes(child.id);
                const isDropTarget = dropTargetId === child.id;
                return (
                  <button
                    key={child.id}
                    ref={(el) => {
                      tileRefs.current[child.id] = el;
                    }}
                    onMouseDown={(e) => handleTileMouseDown(child.id, e)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (renamingId !== child.id) handleSelect(child.id, index, e);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (renamingId !== child.id) handleOpen(child);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedIds((prev) => (prev.has(child.id) ? prev : new Set([child.id])));
                      setItemMenu({ x: e.clientX, y: e.clientY, itemId: child.id });
                    }}
                    className={`flex w-20 flex-col items-center gap-1 rounded p-2 text-center transition ${
                      isDragging ? "opacity-40" : ""
                    } ${
                      isDropTarget
                        ? "bg-sky-400/30 outline outline-2 outline-sky-300"
                        : selectedIds.has(child.id)
                          ? "bg-sky-500/25 outline outline-1 outline-sky-400/50"
                          : "hover:bg-white/[0.06]"
                    }`}
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${child.kind === "folder" ? FOLDER_COLOR : FILE_COLOR} 30%, rgba(6, 8, 16, 0.72))`,
                        color: child.kind === "folder" ? FOLDER_COLOR : FILE_COLOR,
                      }}
                    >
                      {child.kind === "folder" ? <Folder size={18} /> : <Document size={18} />}
                    </span>
                    {renamingId === child.id ? (
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
                      <span className="w-full truncate text-[10px] font-medium text-[var(--os-text)]">
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
              top: Math.min(menu.y, window.innerHeight - 100),
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
              top: Math.min(itemMenu.y, window.innerHeight - 100),
              zIndex: 9500,
            }}
            className="fixed w-[170px] rounded-xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-1.5 shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
          >
            {(!selectedIds.has(itemMenu.itemId) || selectedIds.size <= 1) && (
              <button
                onClick={() => startRename(itemMenu.itemId)}
                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
              >
                Rename
              </button>
            )}
            <button
              onClick={() => {
                const ids =
                  selectedIds.has(itemMenu.itemId) && selectedIds.size > 1
                    ? Array.from(selectedIds)
                    : [itemMenu.itemId];
                setItemMenu(null);
                onDelete(ids);
              }}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-400 transition hover:bg-[var(--os-border-strong)]"
            >
              {selectedIds.has(itemMenu.itemId) && selectedIds.size > 1 ? `Delete ${selectedIds.size} items` : "Delete"}
            </button>
          </div>,
          document.body
        )}
    </FloatingWindow>
  );
}
