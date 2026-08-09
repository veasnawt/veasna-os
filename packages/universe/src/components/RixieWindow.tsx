import React, { useEffect, useRef, useState } from "react";
import { Ai } from "@veasnawt/vicons";
import FloatingWindow from "./FloatingWindow";

export interface OsContext {
  mode?: "3d" | "list";
  openStudios?: string[];
  activeStudio?: string | null;
  terminalCwd?: string | null;
  browsingPath?: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
}

/** Rixie's real chat — now native to Universe's own server (moved from BP Studio's /agent page,
 *  which this replaces) via Universe's own /api/agent route, with the shell's real context
 *  (what's open, active, browsing) sent alongside every message so she can answer about what the
 *  user is actually doing, not just hold a generic conversation. */
export default function RixieWindow({ zIndex, taskbarReserve, minimized, onClose, onFocus, onMinimize, getContext }: RixieWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, studio: "universe", context: getContext() }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply || data.error || "No response." }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Couldn't reach Rixie — check your connection." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <FloatingWindow
      title="Rixie"
      icon={Ai}
      color="#38bdf8"
      cascadeIndex={0}
      zIndex={zIndex}
      defaultWidth={420}
      defaultHeight={560}
      minWidth={340}
      minHeight={360}
      taskbarReserve={taskbarReserve}
      minimized={minimized}
      onClose={onClose}
      onFocus={onFocus}
      onMinimize={onMinimize}
    >
      <div className="flex h-full flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
          {messages.length === 0 && !loading && (
            <div className="mt-10 text-center text-xs text-[var(--os-text-muted)]">
              Ask Rixie anything — she can see what you have open right now.
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                m.role === "user"
                  ? "ml-auto bg-[var(--os-accent-soft)] text-[var(--os-accent-text)]"
                  : "border border-[var(--os-border)] bg-[var(--os-surface)] text-[var(--os-text)]"
              }`}
            >
              {m.content}
            </div>
          ))}
          {loading && <div className="text-[11px] text-[var(--os-text-muted)]">Rixie is thinking…</div>}
        </div>
        <form onSubmit={handleSend} className="flex shrink-0 gap-2 border-t border-[var(--os-border)] p-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Rixie…"
            className="min-w-0 flex-1 rounded-lg border border-[var(--os-border)] bg-[var(--os-surface)] px-3 py-2 text-xs text-[var(--os-text)] outline-none placeholder:text-[var(--os-text-muted)] focus:border-[var(--os-accent-border)]"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="shrink-0 rounded-lg bg-[var(--os-accent-soft)] px-4 py-2 text-xs font-semibold text-[var(--os-accent-text)] transition hover:opacity-90 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </FloatingWindow>
  );
}
