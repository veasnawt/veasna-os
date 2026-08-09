import React, { useEffect, useRef, useState } from "react";
import { Ai } from "@veasnawt/vicons";
import { Plus, History, Trash2, X, Copy, Paperclip, Loader2, EyeOff } from "lucide-react";
import FloatingWindow from "./FloatingWindow";
import MarkdownMessage from "./MarkdownMessage";

export interface OsContext {
  mode?: "3d" | "list";
  openStudios?: string[];
  activeStudio?: string | null;
  terminalCwd?: string | null;
  browsingPath?: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/** Mirrors @veasna/ai's SessionRecord shape (the JSON /api/agent/sessions actually returns) —
 *  defined locally rather than imported, since @veasna/ai pulls in better-sqlite3 and is Node-only;
 *  it must never end up in this client component's bundle. */
interface SessionSummary {
  id: string;
  title?: string;
  updatedAt: number;
}

/** Mirrors @veasna/ai's ChatResult.toolCalls entries — defined locally for the same reason as
 *  SessionSummary above (never import the Node-only @veasna/ai package into this client bundle). */
interface ToolCallTrace {
  name: string;
  input: unknown;
  output: unknown;
}

/** A file picked via the paperclip button, staged in the composer (with an image preview if
 *  applicable) so the user can add a caption and review it before it's actually sent to Rixie —
 *  the upload itself starts immediately in the background so it's usually already done by the
 *  time they finish typing, but sending waits for it to actually finish. */
interface PendingAttachment {
  file: File;
  previewUrl: string | null;
  status: "uploading" | "uploaded" | "error";
  relPath?: string;
  error?: string;
}

interface RixieWindowProps {
  zIndex: number;
  taskbarReserve: number;
  minimized?: boolean;
  onClose: () => void;
  onFocus: () => void;
  onMinimize: () => void;
  /** Live snapshot of what's actually happening in the shell right now — read at send-time (a
   *  ref, not just a prop) so a message typed a while ago still reports CURRENT context, not
   *  whatever was open when the window first mounted. */
  getContext: () => OsContext;
  /** Backend tools like desktop_open_item/desktop_open_studio/desktop_set_theme only validate and
   *  report intent — the real OS shell runs entirely client-side, so /api/agent has no way to
   *  actually open a window or flip the theme itself. These fire when Rixie's response includes a
   *  successful call to one, performing the real action the same way the user's own UI would. */
  onOpenPath: (path: string, kind: "folder" | "file", name: string) => void;
  onOpenStudio: (studioId: string) => void;
  onSetTheme: (theme: "dark" | "light" | "glass") => void;
  /** Optional — lets a host (VeasnaShell's hidden RixieCompanion) mirror what's happening in this
   *  chat without needing this window to be open at all. Fired on every state transition: idle at
   *  rest, thinking while a request is in flight, talking (with the actual reply text) right after
   *  one lands, then back to idle a few seconds later. Never required — chat works identically
   *  with no listener attached. */
  onActivityChange?: (state: { status: "idle" | "thinking" | "talking"; text?: string }) => void;
}

function generateSessionId(): string {
  return `session_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function generateMessageId(): string {
  return `local_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const ATTACHMENT_MARKER_RE = /\n\n\[Attached file: (\{.*\})\]$/;

/** Generates a collision-proof on-disk filename — uploads live in a shared hidden folder (not a
 *  per-message one), so two attachments named "photo.png" must never collide the way they would
 *  in a normal folder (the shared upload route below writes with `wx`/exclusive-create, same as
 *  File Manager's own drag-drop, which correctly SHOULD 409 on a genuine same-folder collision). */
function uniqueUploadName(originalName: string): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}-${originalName}`;
}

/** Pulls the `[Attached file: {...}]` marker handleSend() appends back out of a stored message —
 *  works the same whether the message was just sent or reloaded from a past session, since it's
 *  derived from the persisted content string itself rather than separate client-only state. JSON
 *  (rather than a bare path) so the original filename survives independent of whatever
 *  collision-proofing prefix the on-disk name ended up with. */
function parseAttachment(content: string): { caption: string; relPath: string; displayName: string; isImage: boolean } | null {
  const match = content.match(ATTACHMENT_MARKER_RE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as { path: string; name: string };
    if (!parsed.path || !parsed.name) return null;
    return { caption: content.slice(0, match.index).trim(), relPath: parsed.path, displayName: parsed.name, isImage: IMAGE_EXT_RE.test(parsed.path) };
  } catch {
    return null;
  }
}

/** SessionRecord's timestamps are UNIX seconds (@veasna/ai's SessionStore uses
 *  Math.floor(Date.now() / 1000)), not milliseconds — the *1000 below converts before comparing
 *  against Date.now(). */
function formatRelativeTime(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  if (diffMs < minute) return "Just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < day * 7) return `${Math.floor(diffMs / day)}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Rixie's real chat — native to Universe's own server via /api/agent, with the shell's real
 *  context (what's open, active, browsing) sent alongside every message. Sessions are backed by
 *  @veasna/ai's own SQLite SessionStore (already multi-session-capable server-side); this window
 *  is what actually generates/tracks a sessionId and exposes a ChatGPT/Claude-style history
 *  sidebar for switching between past conversations — none of that existed client-side before. */
export default function RixieWindow({
  zIndex,
  taskbarReserve,
  minimized,
  onClose,
  onFocus,
  onMinimize,
  getContext,
  onOpenPath,
  onOpenStudio,
  onSetTheme,
  onActivityChange,
}: RixieWindowProps) {
  const [sessionId, setSessionId] = useState(generateSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  // True no-persistence, not save-then-delete: while active, /api/agent routes the whole turn
  // through RixieAgent's separate chatIncognito() path (@veasna/ai's agent.ts), which never writes
  // to SQLite and never runs memory extraction — this flag is just what tells the API to take that
  // path, not a client-side simulation of privacy.
  const [incognito, setIncognito] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Cleared/reset on every new turn so an old turn's "revert to idle" timeout can never fire after
  // a NEWER turn has already moved the companion on to its own thinking/talking state.
  const activityIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resizing composer — grows with content up to a cap, then scrolls internally.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  async function refreshSessions() {
    setSessionsLoading(true);
    try {
      const res = await fetch("/api/agent/sessions");
      const data = await res.json();
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch {
      // Best-effort — sidebar just shows whatever it last had.
    } finally {
      setSessionsLoading(false);
    }
  }

  function openSidebar() {
    setSidebarOpen(true);
    refreshSessions();
  }

  function handleNewChat() {
    setSessionId(generateSessionId());
    setMessages([]);
    setInput("");
  }

  // Toggling ON starts a fresh, separately-tracked incognito session (never touches SQLite from
  // this point on); toggling OFF starts an equally fresh REGULAR one — there's no "convert this
  // private chat into a saved one," same as closing a browser's private window doesn't offer to
  // keep the tabs. Preserved across "New chat" (staying incognito, generating a new incognito
  // session id each time) so starting a fresh topic mid-incognito doesn't silently leave privacy
  // mode.
  function toggleIncognito() {
    setIncognito((prev) => !prev);
    setSessionId(generateSessionId());
    setMessages([]);
    setInput("");
    clearAttachment();
  }

  async function handleSelectSession(id: string) {
    if (id === sessionId) {
      setSidebarOpen(false);
      return;
    }
    setSidebarOpen(false);
    setIncognito(false); // Selecting a real saved session always means leaving incognito mode.
    setSessionId(id);
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/agent?sessionId=${encodeURIComponent(id)}`);
      const data = await res.json();
      const loaded: ChatMessage[] = Array.isArray(data.messages)
        ? data.messages.map((m: { id: string; role: string; text: string }) => ({
            id: m.id,
            role: m.role === "user" ? "user" : "assistant",
            content: m.text,
          }))
        : [];
      setMessages(loaded);
    } catch {
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleDeleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSessions((prev) => prev.filter((s) => s.id !== id));
    fetch(`/api/agent/sessions?sessionId=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    if (id === sessionId) handleNewChat();
  }

  /** desktop_open_item/desktop_open_studio/desktop_set_theme only validate server-side and report
   *  what THEY intend — performing the actual client-side effect is this window's job, done here
   *  rather than trusting Rixie's own prose (only a genuinely successful tool call, not just what
   *  she claims in text, ever triggers a real action). */
  function applyToolCallActions(toolCalls: ToolCallTrace[]) {
    for (const call of toolCalls) {
      const output = call.output as
        | { status?: string; path?: string; kind?: "folder" | "file"; studio?: string; theme?: string }
        | undefined;
      if (output?.status !== "success") continue;
      if (call.name === "desktop_open_item" && output.path !== undefined && output.kind) {
        const name = output.path.split("/").pop() || output.path || "Desktop";
        onOpenPath(output.path, output.kind, name);
      } else if (call.name === "desktop_open_studio" && output.studio) {
        onOpenStudio(output.studio);
      } else if (call.name === "desktop_set_theme" && (output.theme === "dark" || output.theme === "light" || output.theme === "glass")) {
        onSetTheme(output.theme);
      }
    }
  }

  async function sendMessage(text: string) {
    if (!text || loading) return;
    setMessages((prev) => [...prev, { id: generateMessageId(), role: "user", content: text }]);
    setLoading(true);
    if (activityIdleTimeoutRef.current) clearTimeout(activityIdleTimeoutRef.current);
    onActivityChange?.({ status: "thinking" });

    let replyText = "";
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, studio: "universe", sessionId, context: getContext(), incognito }),
      });
      const data = await res.json();
      replyText = data.reply || data.error || "No response.";
      setMessages((prev) => [...prev, { id: generateMessageId(), role: "assistant", content: replyText }]);
      if (Array.isArray(data.toolCalls)) applyToolCallActions(data.toolCalls);
      // Incognito never creates/updates a session row server-side — refreshing would just be a
      // wasted round trip that can never find anything new.
      if (!incognito) refreshSessions();
    } catch {
      replyText = "Couldn't reach Rixie — check your connection.";
      setMessages((prev) => [...prev, { id: generateMessageId(), role: "assistant", content: replyText }]);
    } finally {
      setLoading(false);
      onActivityChange?.({ status: "talking", text: replyText });
      activityIdleTimeoutRef.current = setTimeout(() => onActivityChange?.({ status: "idle" }), 6000);
    }
  }

  function clearAttachment() {
    setAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text && !attachment) return;
    if (attachment && attachment.status !== "uploaded") return; // still uploading, or failed — button is disabled for these too

    // Always appended in this exact shape when there's an attachment — parseAttachment() below
    // strips it back out of the stored/reloaded content to render a real thumbnail instead of the
    // raw marker text, so the caption (if any) is what the user actually wrote, while the marker
    // is what Rixie parses for the real sandboxed path (same one desktop_read_file expects).
    const finalText =
      attachment && attachment.relPath
        ? `${text || "Take a look and let me know what you find."}\n\n[Attached file: ${JSON.stringify({ path: attachment.relPath, name: attachment.file.name })}]`
        : text;

    setInput("");
    clearAttachment();
    await sendMessage(finalText);
  }

  /** Starts the upload immediately (so it's usually done by the time the user finishes typing a
   *  caption) but only stages it in the composer — sending is a separate, explicit step the user
   *  controls via handleSend, with a chance to preview (image thumbnail), add a caption, or
   *  remove it first. Uploads straight into the sandbox (the same /api/files/upload route File
   *  Manager's own drag-drop uses) under RIXIE_UPLOADS_DIR — a hidden folder, not a visible Desktop
   *  one, since these are chat attachments the user didn't consciously place there, not real
   *  desktop files — with a collision-proof on-disk name, so Rixie can act on it via her existing
   *  desktop_read_file tool. */
  function handleFileSelected(file: File) {
    clearAttachment();
    const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    setAttachment({ file, previewUrl, status: "uploading" });

    (async () => {
      try {
        const uniqueName = uniqueUploadName(file.name);
        const relPath = `.rixie-uploads/${uniqueName}`;
        const res = await fetch(`/api/files/upload?path=${encodeURIComponent(".rixie-uploads")}&name=${encodeURIComponent(uniqueName)}`, {
          method: "POST",
          body: await file.arrayBuffer(),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Upload failed (${res.status})`);
        }
        setAttachment((prev) => (prev && prev.file === file ? { ...prev, status: "uploaded", relPath } : prev));
      } catch (err) {
        setAttachment((prev) =>
          prev && prev.file === file ? { ...prev, status: "error", error: err instanceof Error ? err.message : "Upload failed" } : prev
        );
      }
    })();
  }

  return (
    <FloatingWindow
      title="Rixie"
      icon={Ai}
      color="#38bdf8"
      cascadeIndex={0}
      zIndex={zIndex}
      defaultWidth={460}
      defaultHeight={600}
      minWidth={340}
      minHeight={360}
      taskbarReserve={taskbarReserve}
      minimized={minimized}
      onClose={onClose}
      onFocus={onFocus}
      onMinimize={onMinimize}
    >
      <div className="relative flex h-full flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--os-border)] px-2 py-1.5">
          <div className="flex items-center gap-1">
            <button
              onClick={openSidebar}
              title="Chat history"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--os-text-muted)] transition hover:bg-[var(--os-border-strong)] hover:text-[var(--os-text)]"
            >
              <History size={13} />
            </button>
            <button
              onClick={toggleIncognito}
              title={incognito ? "Exit incognito — this chat isn't saved or remembered" : "Go incognito — nothing in this chat will be saved or remembered"}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                incognito
                  ? "bg-[var(--os-accent-soft)] text-[var(--os-accent-text)]"
                  : "text-[var(--os-text-muted)] hover:bg-[var(--os-border-strong)] hover:text-[var(--os-text)]"
              }`}
            >
              <EyeOff size={13} />
            </button>
          </div>
          <button
            onClick={handleNewChat}
            title="New chat"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--os-text-muted)] transition hover:bg-[var(--os-border-strong)] hover:text-[var(--os-text)]"
          >
            <Plus size={13} />
            New chat
          </button>
        </div>
        {incognito && (
          <div className="flex shrink-0 items-center justify-center gap-1.5 border-b border-[var(--os-border)] bg-[var(--os-accent-soft)]/40 px-2 py-1 text-[10px] font-medium text-[var(--os-accent-text)]">
            <EyeOff size={11} />
            Incognito — this chat won&apos;t be saved or remembered
          </div>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mx-auto flex w-full max-w-2xl flex-col space-y-3">
            {loadingHistory ? (
              <div className="mt-10 text-center text-xs text-[var(--os-text-muted)]">Loading conversation…</div>
            ) : messages.length === 0 && !loading ? (
              <div className="mt-10 text-center text-xs text-[var(--os-text-muted)]">
                Ask Rixie anything — she can see what you have open right now.
              </div>
            ) : (
              messages.map((m) => {
                if (m.role === "user") {
                  const att = parseAttachment(m.content);
                  const visibleText = att ? att.caption : m.content;
                  return (
                    <div key={m.id} className="group ml-auto flex max-w-[85%] flex-col items-end gap-1.5">
                      {att && att.isImage && (
                        <img
                          src={`/api/files/raw?path=${encodeURIComponent(att.relPath)}`}
                          alt={att.displayName}
                          className="max-h-48 rounded-xl border border-[var(--os-border)] object-contain"
                        />
                      )}
                      {att && !att.isImage && (
                        <div className="flex items-center gap-1.5 rounded-lg border border-[var(--os-border)] bg-[var(--os-surface)] px-2 py-1 text-[10px] text-[var(--os-text-muted)]">
                          <Paperclip size={11} />
                          {att.displayName}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap rounded-xl bg-[var(--os-accent-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--os-accent-text)]">
                        {visibleText}
                      </div>
                      {visibleText && (
                        <button
                          onClick={() => navigator.clipboard.writeText(visibleText)}
                          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--os-text-muted)] opacity-0 transition hover:bg-[var(--os-border-strong)] hover:text-[var(--os-text)] group-hover:opacity-100"
                        >
                          <Copy size={10} />
                          Copy
                        </button>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={m.id} className="group flex gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--os-accent-soft)] text-[var(--os-accent-text)]">
                      <Ai size={11} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <MarkdownMessage content={m.content} />
                      <button
                        onClick={() => navigator.clipboard.writeText(m.content)}
                        className="mt-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--os-text-muted)] opacity-0 transition hover:bg-[var(--os-border-strong)] hover:text-[var(--os-text)] group-hover:opacity-100"
                      >
                        <Copy size={10} />
                        Copy
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            {loading && (
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--os-accent-soft)] text-[var(--os-accent-text)]">
                  <Ai size={11} />
                </span>
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--os-text-muted)] [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--os-text-muted)] [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--os-text-muted)]" />
                </div>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSend} className="shrink-0 border-t border-[var(--os-border)] p-3">
          {attachment && (
            <div className="mx-auto mb-2 flex w-full max-w-2xl items-center gap-2 rounded-lg border border-[var(--os-border)] bg-[var(--os-surface)] px-2 py-1.5">
              {attachment.previewUrl ? (
                <img src={attachment.previewUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[var(--os-border-strong)] text-[var(--os-text-muted)]">
                  <Paperclip size={13} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-medium text-[var(--os-text)]">{attachment.file.name}</div>
                <div className={`truncate text-[10px] ${attachment.status === "error" ? "text-red-400" : "text-[var(--os-text-muted)]"}`}>
                  {attachment.status === "uploading" ? "Uploading…" : attachment.status === "error" ? attachment.error || "Upload failed" : "Ready — add a caption or just hit Send"}
                </div>
              </div>
              {attachment.status === "uploading" && <Loader2 size={13} className="shrink-0 animate-spin text-[var(--os-text-muted)]" />}
              <button
                type="button"
                onClick={clearAttachment}
                title="Remove attachment"
                className="shrink-0 rounded p-1 text-[var(--os-text-muted)] transition hover:bg-[var(--os-border-strong)] hover:text-[var(--os-text)]"
              >
                <X size={13} />
              </button>
            </div>
          )}
          <div className="mx-auto flex w-full max-w-2xl items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ""; // Allows re-selecting the same file consecutively.
                if (file) handleFileSelected(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || incognito}
              title={incognito ? "Attachments are disabled in incognito — uploading still writes a real file to disk" : "Attach a file"}
              className="flex shrink-0 items-center justify-center rounded-lg border border-[var(--os-border)] bg-[var(--os-surface)] p-2 text-[var(--os-text-muted)] transition hover:bg-[var(--os-border-strong)] hover:text-[var(--os-text)] disabled:opacity-40"
            >
              <Paperclip size={14} />
            </button>
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask Rixie…"
              // The classic-Windows up/down-arrow scrollbar (Electron renders unstyled scrollbars
              // that way) was showing on this textarea even at one line, since a growing textarea's
              // scrollHeight can exceed its clientHeight by a stray pixel from padding/line-height
              // rounding. A thin custom-styled scrollbar replaces it instead of trying to hide
              // overflow outright, which would break scrolling once content exceeds the max-height cap.
              className="max-h-[120px] min-h-[20px] min-w-0 flex-1 resize-none rounded-lg border border-[var(--os-border)] bg-[var(--os-surface)] px-3 py-2 text-xs text-[var(--os-text)] outline-none placeholder:text-[var(--os-text-muted)] focus:border-[var(--os-accent-border)] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--os-border-strong)] [&::-webkit-scrollbar-track]:bg-transparent"
            />
            <button
              type="submit"
              disabled={(!input.trim() && !attachment) || loading || (attachment != null && attachment.status !== "uploaded")}
              className="shrink-0 rounded-lg bg-[var(--os-accent-soft)] px-4 py-2 text-xs font-semibold text-[var(--os-accent-text)] transition hover:opacity-90 disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </form>

        {sidebarOpen && (
          <>
            <div className="absolute inset-0 z-10 bg-black/40" onClick={() => setSidebarOpen(false)} />
            <div className="absolute inset-y-0 left-0 z-20 flex w-56 flex-col border-r border-[var(--os-border)] bg-[var(--os-surface-strong)] backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)]">
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--os-border)] px-2.5 py-2">
                <span className="text-[11px] font-semibold text-[var(--os-text)]">Chats</span>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="rounded p-1 text-[var(--os-text-muted)] transition hover:bg-[var(--os-border-strong)] hover:text-[var(--os-text)]"
                >
                  <X size={13} />
                </button>
              </div>
              <button
                onClick={() => {
                  handleNewChat();
                  setSidebarOpen(false);
                }}
                className="m-2 flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--os-border)] px-2 py-1.5 text-[11px] font-medium text-[var(--os-text)] transition hover:bg-[var(--os-border-strong)]"
              >
                <Plus size={12} />
                New chat
              </button>
              <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-2">
                {sessionsLoading ? (
                  <div className="px-2 py-2 text-[11px] text-[var(--os-text-muted)]">Loading…</div>
                ) : sessions.length === 0 ? (
                  <div className="px-2 py-2 text-[11px] text-[var(--os-text-muted)]">No chats yet</div>
                ) : (
                  sessions.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => handleSelectSession(s.id)}
                      className={`group flex cursor-pointer items-center justify-between gap-1 rounded-lg px-2 py-1.5 transition hover:bg-[var(--os-border-strong)] ${
                        s.id === sessionId ? "bg-[var(--os-border-strong)]" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-medium text-[var(--os-text)]">{s.title || "New chat"}</div>
                        <div className="text-[10px] text-[var(--os-text-muted)]">{formatRelativeTime(s.updatedAt)}</div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteSession(s.id, e)}
                        className="shrink-0 rounded p-1 text-[var(--os-text-muted)] opacity-0 transition hover:bg-white/10 hover:text-[var(--os-text)] group-hover:opacity-100"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </FloatingWindow>
  );
}
