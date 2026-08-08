import React, { useEffect, useRef, useState } from "react";
import { Document } from "@veasnawt/vicons";
import { readFile, writeFile } from "../utils/filesApi";
import FloatingWindow from "./FloatingWindow";

interface FileEditorWindowProps {
  path: string;
  name: string;
  cascadeIndex: number;
  zIndex: number;
  taskbarReserve: number;
  minimized?: boolean;
  onClose: () => void;
  onFocus: () => void;
  onMinimize: () => void;
}

const AUTOSAVE_DELAY = 450;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function FileEditorWindow({
  path,
  name,
  cascadeIndex,
  zIndex,
  taskbarReserve,
  minimized,
  onClose,
  onFocus,
  onMinimize,
}: FileEditorWindowProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef("");
  // The last content known to match what's on disk (just loaded, or just saved). Comparing
  // against this — rather than a "just loaded, skip the next save" flag — is what actually
  // works: React bails out of re-rendering (and re-running effects) when setContent is called
  // with a value equal to current state, which happens for any brand-new empty file (initial
  // state is already ""), so a flag meant to be "consumed" by the next effect run never gets
  // reset and ends up silently skipping the save after the user's *next* real edit instead.
  const baselineRef = useRef("");

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    readFile(path)
      .then((text) => {
        if (cancelled) return;
        baselineRef.current = text;
        setContent(text);
      })
      .catch((err) => {
        if (!cancelled) setError(errMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => {
    if (content === baselineRef.current) return;
    const t = setTimeout(() => {
      baselineRef.current = content;
      writeFile(path, content).catch((err) => setError(errMessage(err)));
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(t);
  }, [content, path]);

  function flush() {
    if (contentRef.current !== baselineRef.current) {
      baselineRef.current = contentRef.current;
      writeFile(path, contentRef.current).catch((err) => setError(errMessage(err)));
    }
  }

  useEffect(() => {
    return () => flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    flush();
    onClose();
  }

  return (
    <FloatingWindow
      title={name}
      icon={Document}
      color="#94a3b8"
      cascadeIndex={cascadeIndex}
      zIndex={zIndex}
      defaultWidth={440}
      defaultHeight={360}
      taskbarReserve={taskbarReserve}
      minimized={minimized}
      onClose={handleClose}
      onFocus={onFocus}
      onMinimize={onMinimize}
    >
      <div className="flex h-full w-full flex-col">
        {error && (
          <div className="flex shrink-0 items-center gap-2 border-b border-rose-500/30 bg-rose-950/60 px-3 py-1.5 text-[11px] text-rose-200">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-rose-300 transition hover:text-white">
              ×
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center text-xs text-[var(--os-text-muted)]">Loading…</div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Start typing…"
              spellCheck={false}
              className="h-full w-full resize-none bg-transparent text-xs leading-relaxed text-[var(--os-text)] outline-none placeholder:text-[var(--os-text-muted)]"
            />
          )}
        </div>
      </div>
    </FloatingWindow>
  );
}
