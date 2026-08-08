import React, { useEffect, useRef, useState } from "react";

interface TerminalPanelProps {
  sessionId: string;
  lines: string[];
  onLinesChange: (lines: string[]) => void;
  cwd: string;
  onCwdChange: (cwd: string) => void;
}

const META_MARKER = "@@VEASNA_TERMINAL_META@@";

export default function TerminalPanel({ sessionId, lines, onLinesChange, cwd, onCwdChange }: TerminalPanelProps) {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const baseLinesRef = useRef<string[]>(lines);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [lines]);

  useEffect(() => {
    inputRef.current?.focus();
    if (cwd) return;
    fetch("/api/terminal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cwd", sessionId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.cwd === "string") onCwdChange(data.cwd);
      })
      .catch(() => {});
    // Only meant to run once, on first mount — deliberately not re-fetching if cwd changes later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runCommand(command: string) {
    const promptLine = `${cwd}> ${command}`;
    const base = [...lines, promptLine];
    baseLinesRef.current = base;
    onLinesChange(base);
    setRunning(true);

    let buffer = "";
    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exec", sessionId, command }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const markerIdx = buffer.indexOf(META_MARKER);
          const visible = markerIdx === -1 ? buffer : buffer.slice(0, markerIdx);
          onLinesChange([...baseLinesRef.current, ...visible.split("\n")]);
        }
      }
    } catch (err) {
      buffer += `\nFailed to reach terminal backend: ${err instanceof Error ? err.message : String(err)}`;
    }

    const markerIdx = buffer.indexOf(META_MARKER);
    const visible = markerIdx === -1 ? buffer : buffer.slice(0, markerIdx);
    const metaRaw = markerIdx === -1 ? null : buffer.slice(markerIdx + META_MARKER.length);
    onLinesChange([...baseLinesRef.current, ...visible.split("\n")]);

    if (metaRaw) {
      try {
        const meta = JSON.parse(metaRaw);
        if (typeof meta.cwd === "string") onCwdChange(meta.cwd);
      } catch {
        // malformed trailer — keep the previous cwd rather than guessing
      }
    }
    setRunning(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const command = input.trim();
    setInput("");
    historyIndexRef.current = -1;
    if (!command) {
      onLinesChange([...lines, `${cwd}> `]);
      return;
    }
    historyRef.current.push(command);
    // `cls`/`clear` are intercepted client-side rather than spawned — the shell has no
    // real console attached (stdout is a plain pipe), so a spawned `cls` does nothing visible.
    if (/^(cls|clear)$/i.test(command)) {
      onLinesChange([]);
      return;
    }
    runCommand(command);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const hist = historyRef.current;
      if (hist.length === 0) return;
      const next = historyIndexRef.current < 0 ? hist.length - 1 : Math.max(0, historyIndexRef.current - 1);
      historyIndexRef.current = next;
      setInput(hist[next]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const hist = historyRef.current;
      if (historyIndexRef.current < 0) return;
      const next = historyIndexRef.current + 1;
      if (next >= hist.length) {
        historyIndexRef.current = -1;
        setInput("");
      } else {
        historyIndexRef.current = next;
        setInput(hist[next]);
      }
    }
  }

  async function handleStop() {
    await fetch("/api/terminal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "kill", sessionId }),
    });
  }

  return (
    <div
      className="flex h-full w-full flex-col bg-[#0b0e14] text-[12px]"
      onClick={() => inputRef.current?.focus()}
    >
      <div ref={outputRef} className="flex-1 overflow-y-auto px-3 py-2 font-mono leading-relaxed text-slate-200">
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">
            {line || " "}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-white/10 px-3 py-2 font-mono">
        <span className="shrink-0 text-sky-400">{cwd}&gt;</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={running}
          placeholder={running ? "running…" : ""}
          spellCheck={false}
          autoComplete="off"
          className="flex-1 bg-transparent text-slate-100 outline-none placeholder:text-slate-500 disabled:opacity-50"
        />
        {running ? (
          <button
            type="button"
            onClick={handleStop}
            className="shrink-0 rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-300 transition hover:bg-rose-500/30"
          >
            Stop
          </button>
        ) : (
          lines.length > 0 && (
            <button
              type="button"
              onClick={() => onLinesChange([])}
              title="Clear terminal history"
              className="shrink-0 rounded bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
            >
              Clear
            </button>
          )
        )}
      </form>
    </div>
  );
}
