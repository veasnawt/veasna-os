"use client";

/**
 * AgentChat — the console for talking to the Rixie agent with dynamic provider switching.
 *
 * Supports dynamic runtime switching between Anthropic, OpenAI, Gemini, and Ollama.
 */

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Ai, Art, Music, Game, Publish, Search, Code } from "@veasnawt/vicons";

type Studio = "" | "bp" | "art" | "music" | "gamedev";
type ProviderOption = "anthropic" | "openai" | "gemini" | "ollama";

const STUDIOS: { id: Studio; label: string; icon?: React.ComponentType<{ size?: number }> }[] = [
  { id: "", label: "All" },
  { id: "bp", label: "BP Studio", icon: Publish },
  { id: "art", label: "Art", icon: Art },
  { id: "music", label: "Music", icon: Music },
  { id: "gamedev", label: "Game Dev", icon: Game },
];

const PROVIDERS: { id: ProviderOption; label: string; defaultModel: string }[] = [
  { id: "anthropic", label: "Anthropic (Claude)", defaultModel: "claude-sonnet-5" },
  { id: "openai", label: "OpenAI (GPT-4o)", defaultModel: "gpt-4o" },
  { id: "gemini", label: "Google Gemini", defaultModel: "gemini-2.0-flash" },
  { id: "ollama", label: "Ollama (Local)", defaultModel: "llama3.1" },
];

interface ToolCallTrace {
  name: string;
  input: unknown;
  output: unknown;
}

interface ChatMessage {
  id: string;
  role: "user" | "agent" | "error";
  text: string;
  toolCalls?: ToolCallTrace[];
  provider?: string;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function AgentChat() {
  const [studio, setStudio] = useState<Studio>("");
  const [provider, setProvider] = useState<ProviderOption>("anthropic");
  const [model, setModel] = useState<string>("claude-sonnet-5");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleProviderChange = (newProvider: ProviderOption) => {
    setProvider(newProvider);
    const found = PROVIDERS.find((p) => p.id === newProvider);
    if (found) {
      setModel(found.defaultModel);
    }
  };

  useEffect(() => {
    fetch("/api/agent?sessionId=default_session")
      .then((res) => res.json())
      .then((data) => {
        if (data.messages && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  async function sendMessage(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const outgoing = studio ? `[Studio: ${studio}] ${trimmed}` : trimmed;
    const userMsg: ChatMessage = { id: uid(), role: "user", text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: outgoing, provider, model }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      const data = (await res.json()) as { reply: string; toolCalls: ToolCallTrace[] };
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "agent", text: data.reply, toolCalls: data.toolCalls, provider },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong reaching the agent.";
      setMessages((prev) => [...prev, { id: uid(), role: "error", text: msg }]);
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-[#0A0C12] text-[#E7E6EF]">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2BADFB] shadow-[0_0_8px_2px_rgba(43,173,251,0.5)]" />
          <h1 className="font-[family-name:var(--font-display,inherit)] text-[15px] font-medium tracking-wide text-[#E7E6EF]">
            rixie<span className="text-[#6B7086]">-core</span>
          </h1>
        </div>

        {/* Dynamic Provider Selector & Studio Filter */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs">
            <span className="text-[#6B7086]">Provider:</span>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as ProviderOption)}
              className="bg-transparent font-medium text-[#2BADFB] focus:outline-none cursor-pointer"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#14161F] text-[#E7E6EF]">
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <nav className="flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] p-1">
            {STUDIOS.map((s) => {
              const IconComp = s.icon;
              return (
                <button
                  key={s.id || "all"}
                  type="button"
                  onClick={() => setStudio(s.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    studio === s.id
                      ? "bg-[#2BADFB] text-[#14120C]"
                      : "text-[#8B8FA3] hover:text-[#E7E6EF]"
                  }`}
                >
                  {IconComp && <IconComp size={13} />}
                  {s.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Message stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          {messages.length === 0 && (
            <div className="mt-16 flex flex-col items-center gap-2 text-center">
              <Ai size={32} className="text-[#2BADFB]" />
              <p className="text-sm text-[#6B7086]">
                Every project is a world. Active provider: <span className="text-[#2BADFB]">{provider}</span> ({model})
              </p>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {isSending && (
            <div className="flex items-center gap-2 self-start text-xs text-[#6B7086]">
              <span className="flex gap-1">
                <Dot delay="0ms" />
                <Dot delay="120ms" />
                <Dot delay="240ms" />
              </span>
              working with {provider}
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <form onSubmit={sendMessage} className="border-t border-white/[0.06] px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-2xl items-end gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 focus-within:border-[#2BADFB]/40">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={
              studio ? `Ask the ${STUDIOS.find((s) => s.id === studio)?.label} anything…` : "Ask anything…"
            }
            className="max-h-40 flex-1 resize-none bg-transparent text-sm text-[#E7E6EF] placeholder:text-[#4E5266] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || isSending}
            aria-label="Send message"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2BADFB] text-[#14120C] transition-opacity disabled:opacity-30"
          >
            <ArrowIcon />
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-[#1C1F2B] px-4 py-2.5 text-sm text-[#E7E6EF]">
        {message.text}
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="max-w-[85%] self-start rounded-2xl rounded-bl-sm border border-red-500/20 bg-red-500/[0.06] px-4 py-2.5 text-sm text-red-300">
        {message.text}
      </div>
    );
  }

  return (
    <div className="flex max-w-[90%] flex-col gap-2 self-start">
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {message.toolCalls.map((call, i) => (
            <ToolTrace key={i} call={call} />
          ))}
        </div>
      )}
      <div className="whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-white/[0.04] px-4 py-2.5 text-sm leading-relaxed text-[#E7E6EF]">
        {message.text}
      </div>
    </div>
  );
}

function ToolTrace({ call }: { call: ToolCallTrace }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border-l-2 border-[#2BADFB]/50 bg-white/[0.02] px-3 py-2 font-mono text-[11px] text-[#8B8FA3]">
      <Code size={12} className="text-[#2BADFB] shrink-0" />
      <div>
        <span className="text-[#2BADFB]">{call.name}</span>
        <span className="text-[#4E5266]">({JSON.stringify(call.input)})</span>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1 w-1 animate-bounce rounded-full bg-[#2BADFB]"
      style={{ animationDelay: delay }}
    />
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
