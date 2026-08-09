import React from "react";
import { getFileKind, getFileIcon, getFileColor } from "../utils/fileTypes";
import { rawFileUrl } from "../utils/filesApi";
import FloatingWindow from "./FloatingWindow";

interface FilePreviewWindowProps {
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

/** Handles every non-text file kind (image/audio/video/pdf/other) — `FileEditorWindow` remains the
 *  plain-text editor for `text`-kind files, this is everything else. Kept as a separate component
 *  rather than branching inside `FileEditorWindow` since none of these kinds need any of its
 *  autosave/textarea machinery at all. */
export default function FilePreviewWindow({
  path,
  name,
  cascadeIndex,
  zIndex,
  taskbarReserve,
  minimized,
  onClose,
  onFocus,
  onMinimize,
}: FilePreviewWindowProps) {
  const kind = getFileKind(name);
  const url = rawFileUrl(path);
  const Icon = getFileIcon(name);
  const color = getFileColor(name);

  return (
    <FloatingWindow
      title={name}
      icon={Icon}
      color={color}
      cascadeIndex={cascadeIndex}
      zIndex={zIndex}
      defaultWidth={kind === "image" || kind === "video" ? 560 : 480}
      defaultHeight={kind === "image" || kind === "video" ? 440 : 380}
      taskbarReserve={taskbarReserve}
      minimized={minimized}
      onClose={onClose}
      onFocus={onFocus}
      onMinimize={onMinimize}
    >
      <div className="flex h-full w-full flex-col bg-[#0b0e14]">
        {kind === "image" && (
          <div className="flex h-full w-full items-center justify-center overflow-auto p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user files on a
                sandboxed local filesystem, not something next/image's remote-origin optimization applies to */}
            <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
          </div>
        )}

        {kind === "video" && (
          <div className="flex h-full w-full items-center justify-center bg-black">
            <video controls src={url} className="max-h-full max-w-full" />
          </div>
        )}

        {kind === "pdf" && <iframe src={url} title={name} className="h-full w-full border-0 bg-white" />}

        {kind === "audio" && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-5 p-6">
            <span
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `color-mix(in srgb, ${color} 30%, rgba(6, 8, 16, 0.72))`, color }}
            >
              <Icon size={32} />
            </span>
            <audio controls src={url} className="w-full max-w-sm" />
          </div>
        )}

        {kind === "other" && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
            <span
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `color-mix(in srgb, ${color} 30%, rgba(6, 8, 16, 0.72))`, color }}
            >
              <Icon size={32} />
            </span>
            <span className="text-xs text-[var(--os-text-muted)]">This file type can't be previewed here.</span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              download={name}
              className="rounded-full bg-[var(--os-accent-soft)] px-4 py-1.5 text-xs font-semibold text-[var(--os-accent-text)] transition hover:opacity-90"
            >
              Open / Download
            </a>
          </div>
        )}
      </div>
    </FloatingWindow>
  );
}
