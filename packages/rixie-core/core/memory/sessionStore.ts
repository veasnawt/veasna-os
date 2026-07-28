/**
 * Persistent SQLite SessionStore for Rixie Core.
 *
 * Stores conversation sessions and messages persistently in memory.db
 * so chat history survives process restarts, serverless Next.js route invocations,
 * and page refreshes.
 */
import Database from "better-sqlite3";
import { ProviderMessage, ToolCall } from "../providers/types";

export interface SessionRecord {
  id: string;
  studio: string;
  provider: string;
  model: string;
  createdAt: number;
  updatedAt: number;
}

export interface UiChatMessage {
  id: string;
  role: "user" | "agent" | "error";
  text: string;
  toolCalls?: Array<{ name: string; input: unknown; output: unknown }>;
  provider?: string;
  createdAt: number;
}

export class SessionStore {
  private db: Database.Database;

  constructor(dbPathOrInstance: string | Database.Database = "./core/data/memory.db") {
    if (typeof dbPathOrInstance === "string") {
      this.db = new Database(dbPathOrInstance);
    } else {
      this.db = dbPathOrInstance;
    }
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        studio TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT,
        tool_call_id TEXT,
        tool_name TEXT,
        tool_calls TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);
  }

  getOrCreateSession(
    sessionId = "default_session",
    studio = "global",
    provider = "anthropic",
    model = "claude-sonnet-5"
  ): SessionRecord {
    const existing = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as any;

    const now = Math.floor(Date.now() / 1000);
    if (existing) {
      this.db
        .prepare("UPDATE sessions SET studio = ?, provider = ?, model = ?, updated_at = ? WHERE id = ?")
        .run(studio, provider, model, now, sessionId);
      return {
        id: existing.id,
        studio,
        provider,
        model,
        createdAt: existing.created_at,
        updatedAt: now,
      };
    }

    this.db
      .prepare(
        "INSERT INTO sessions (id, studio, provider, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(sessionId, studio, provider, model, now, now);

    return {
      id: sessionId,
      studio,
      provider,
      model,
      createdAt: now,
      updatedAt: now,
    };
  }

  addMessage(sessionId: string, message: ProviderMessage): void {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        `INSERT INTO messages (session_id, role, content, tool_call_id, tool_name, tool_calls, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        sessionId,
        message.role,
        message.content || "",
        message.toolCallId || null,
        message.toolName || null,
        message.toolCalls ? JSON.stringify(message.toolCalls) : null,
        now
      );
  }

  getHistory(sessionId: string, limit = 50): ProviderMessage[] {
    const rows = this.db
      .prepare(
        `SELECT role, content, tool_call_id, tool_name, tool_calls FROM messages
         WHERE session_id = ? ORDER BY id ASC LIMIT ?`
      )
      .all(sessionId, limit) as any[];

    return rows.map((r) => ({
      role: r.role,
      content: r.content || "",
      toolCallId: r.tool_call_id || undefined,
      toolName: r.tool_name || undefined,
      toolCalls: r.tool_calls ? (JSON.parse(r.tool_calls) as ToolCall[]) : undefined,
    }));
  }

  getUiMessages(sessionId: string): UiChatMessage[] {
    const rows = this.db
      .prepare(
        `SELECT id, role, content, tool_calls, created_at FROM messages
         WHERE session_id = ? AND role IN ('user', 'assistant', 'error') ORDER BY id ASC`
      )
      .all(sessionId) as any[];

    return rows.map((r) => ({
      id: String(r.id),
      role: r.role === "assistant" ? "agent" : (r.role as "user" | "agent" | "error"),
      text: r.content || "",
      toolCalls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
      createdAt: r.created_at,
    }));
  }

  clearSession(sessionId: string): void {
    this.db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }
}
