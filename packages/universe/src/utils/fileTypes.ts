import { Art, Code, Document, Globe, Music } from "@veasnawt/vicons";
import React from "react";
import VideoIcon from "../components/VideoIcon";
import PdfIcon from "../components/PdfIcon";

export type FileKind = "image" | "audio" | "video" | "pdf" | "html" | "text" | "other";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".avi", ".mkv"]);
const PDF_EXT = new Set([".pdf"]);
// A real webpage, not source to edit by default — opens in the Browser studio (rendered), matching
// what double-clicking an .html file does on a real OS. Deliberately separate from CODE_EXT below.
const HTML_EXT = new Set([".html", ".htm"]);
// Deliberately an ALLOWLIST, not a denylist: opening a file means decoding it as UTF-8 text, which
// silently corrupts anything actually binary if it ever gets saved back (autosave included). Safer
// to under-recognize an obscure text format (falls back to the safe "can't preview" state, no data
// risk) than to over-recognize a binary one (real risk of destroying the original file).
const CODE_EXT = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".java", ".c", ".h", ".cpp", ".hpp", ".cs",
  ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".sh", ".bash", ".ps1", ".sql",
  ".css", ".scss", ".sass", ".less", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".xml", ".md",
  ".mdx", ".loom", ".lua", ".vue", ".svelte", ".graphql", ".proto",
]);
const TEXT_EXT = new Set([".txt", ".log", ".csv", ".ini", ".conf", ".cfg", ".env", ".gitignore", ".editorconfig"]);

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  // No extension (README, Dockerfile, Makefile, ...) — in a dev-tool context these are almost
  // always plain text, and treating them as such carries the same low risk as any other guess here.
  if (dot <= 0) return "";
  return name.slice(dot).toLowerCase();
}

export function getFileKind(name: string): FileKind {
  const ext = extOf(name);
  if (!ext) return "text";
  if (IMAGE_EXT.has(ext)) return "image";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (VIDEO_EXT.has(ext)) return "video";
  if (PDF_EXT.has(ext)) return "pdf";
  if (HTML_EXT.has(ext)) return "html";
  if (CODE_EXT.has(ext) || TEXT_EXT.has(ext)) return "text";
  return "other";
}

export const FILE_KIND_COLORS: Record<FileKind, string> = {
  image: "#ec4899",
  audio: "#10b981",
  video: "#ef4444",
  pdf: "#f97316",
  html: "#38bdf8",
  text: "#94a3b8",
  other: "#94a3b8",
};

export const FILE_KIND_ICONS: Record<FileKind, React.ComponentType<{ size?: number }>> = {
  image: Art,
  audio: Music,
  video: VideoIcon,
  pdf: PdfIcon,
  html: Globe,
  text: Document,
  other: Document,
};

/** `text`-kind files additionally get the `Code` icon instead of the plain `Document` one when
 *  their extension is a recognized programming-language/config format — purely cosmetic (both are
 *  still opened in the same plain-text editor), kept separate from `FILE_KIND_ICONS`/`getFileKind`
 *  since the open-behavior distinction (text vs. everything else) and the icon distinction
 *  (code vs. prose) are different concerns that don't need to move together. */
export function getFileIcon(name: string): React.ComponentType<{ size?: number }> {
  const kind = getFileKind(name);
  if (kind === "text" && CODE_EXT.has(extOf(name))) return Code;
  return FILE_KIND_ICONS[kind];
}

export function getFileColor(name: string): string {
  return FILE_KIND_COLORS[getFileKind(name)];
}
