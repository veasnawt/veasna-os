import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Folder, Document } from "@veasnawt/vicons";
import { CelestialBody, StudioId } from "../types";
import { RemoteEntry, searchFiles } from "../utils/filesApi";
import { FOLDER_COLOR, FILE_COLOR } from "../utils/desktopItems";

interface SearchOverlayProps {
  bodies: CelestialBody[];
  icons: Record<StudioId, React.ComponentType<{ size?: number }>>;
  onOpenApp: (body: CelestialBody) => void;
  onOpenFileManager: () => void;
  onOpenDesktopPath: (path: string, kind: "folder" | "file", name: string) => void;
  onClose: () => void;
}

type ResultItem =
  | { kind: "studio"; id: string; name: string; subtitle: string; color: string; icon: React.ComponentType<{ size?: number }>; onSelect: () => void }
  | { kind: "filemanager"; id: string; name: string; subtitle: string; color: string; icon: React.ComponentType<{ size?: number }>; onSelect: () => void }
  | { kind: "folder" | "file"; id: string; name: string; subtitle: string; color: string; icon: React.ComponentType<{ size?: number }>; onSelect: () => void };

const DEBOUNCE_MS = 200;
const MAX_STUDIO_RESULTS = 6;
const MAX_FILE_RESULTS = 8;

export default function SearchOverlay({ bodies, icons, onOpenApp, onOpenFileManager, onOpenDesktopPath, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [fileResults, setFileResults] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setFileResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      searchFiles(q)
        .then((entries) => {
          if (!cancelled) setFileResults(entries.slice(0, MAX_FILE_RESULTS));
        })
        .catch(() => {
          if (!cancelled) setFileResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const results: ResultItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items: ResultItem[] = [];

    if (!q) return items;

    const matchedBodies = bodies.filter((b) => b.name.toLowerCase().includes(q)).slice(0, MAX_STUDIO_RESULTS);
    for (const body of matchedBodies) {
      items.push({
        kind: "studio",
        id: body.id,
        name: body.name,
        subtitle: body.subtitle,
        color: body.color,
        icon: icons[body.id],
        onSelect: () => onOpenApp(body),
      });
    }

    if ("file manager".includes(q) || "files".includes(q)) {
      items.push({
        kind: "filemanager",
        id: "filemanager",
        name: "File Manager",
        subtitle: "Browse the Desktop",
        color: FOLDER_COLOR,
        icon: Folder,
        onSelect: onOpenFileManager,
      });
    }

    for (const entry of fileResults) {
      items.push({
        kind: entry.kind,
        id: entry.path,
        name: entry.name,
        subtitle: entry.kind === "folder" ? `Folder — Desktop/${entry.path}` : `File — Desktop/${entry.path}`,
        color: entry.kind === "folder" ? FOLDER_COLOR : FILE_COLOR,
        icon: entry.kind === "folder" ? Folder : Document,
        onSelect: () => onOpenDesktopPath(entry.path, entry.kind, entry.name),
      });
    }

    return items;
  }, [query, bodies, icons, fileResults, onOpenApp, onOpenFileManager, onOpenDesktopPath]);

  useEffect(() => {
    setActiveIndex(0);
  }, [results.length, query]);

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function selectResult(item: ResultItem) {
    item.onSelect();
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) selectResult(item);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-start justify-center bg-black/50 pt-[14vh] backdrop-blur-sm"
      style={{ zIndex: 99998 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--os-border)] px-4 py-3">
          <span className="text-[var(--os-text-muted)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
            </svg>
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search studios, folders, and files…"
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-transparent text-sm text-[var(--os-text)] outline-none placeholder:text-[var(--os-text-muted)]"
          />
          <kbd className="rounded border border-[var(--os-border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--os-text-muted)]">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
          {query.trim() === "" ? (
            <div className="px-3 py-8 text-center text-xs text-[var(--os-text-muted)]">
              Start typing to search studios, folders, and files.
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-[var(--os-text-muted)]">
              {loading ? "Searching…" : "No matches found."}
            </div>
          ) : (
            results.map((item, i) => (
              <button
                key={`${item.kind}:${item.id}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectResult(item)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                  i === activeIndex ? "bg-[var(--os-border-strong)]" : "hover:bg-[var(--os-border-strong)]/60"
                }`}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `color-mix(in srgb, ${item.color} 30%, rgba(6, 8, 16, 0.72))`, color: item.color }}
                >
                  {React.createElement(item.icon, { size: 16 })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[var(--os-text)]">{item.name}</span>
                  <span className="block truncate text-[11px] text-[var(--os-text-muted)]">{item.subtitle}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
