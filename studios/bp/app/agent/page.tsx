"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Ai } from "@veasnawt/vicons";
import { OceanBackdrop } from "@/components/OceanBackdrop";

export default function AgentPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, studio: "bp" }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply || data.error }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Error communicating with Rixie AI Partner." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-screen w-full flex-col">
      <OceanBackdrop />

      <div className="relative flex items-center justify-between px-6 py-4 border-b border-border">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-full border border-border bg-card/60 px-4 py-2 text-xs font-semibold text-muted-foreground backdrop-blur-xl transition hover:text-foreground hover:border-primary/40"
        >
          ← BP Studio
        </Link>

        <div className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-xs font-bold text-primary">
          <Ai size={14} />
          <span>Rixie AI Partner</span>
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto px-6 py-6 space-y-3 max-w-3xl mx-auto w-full">
        {messages.length === 0 && !loading && (
          <div className="mt-16 text-center text-muted-foreground">
            <p className="text-sm">Ask Rixie to brainstorm ideas, plan a scene, or check in on this project.</p>
          </div>
        )}

        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-xl max-w-xl text-sm ${
              m.role === "user"
                ? "ml-auto bg-primary/15 text-foreground"
                : "bg-card border border-border text-foreground"
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="text-xs text-primary font-mono animate-pulse">
            Rixie reasoning via Local-First Engine...
          </div>
        )}
      </div>

      <form
        onSubmit={handleSend}
        className="relative flex gap-2 px-6 py-4 border-t border-border max-w-3xl mx-auto w-full"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Rixie or launch BP Studio task..."
          className="flex-1 rounded-xl bg-card border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
        />
        <button
          type="submit"
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_0_20px_-6px_var(--primary)] transition hover:bg-primary/85"
        >
          Send
        </button>
      </form>
    </div>
  );
}
