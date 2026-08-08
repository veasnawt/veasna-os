/**
 * Shared memory store for rixie.
 *
 * Deliberately dependency-light: better-sqlite3 + simple keyword search.
 * This is a starting point — swap `search()` for real embedding similarity
 * (e.g. via a vector DB + an embeddings call) once you want semantic recall.
 * Schema is generic on purpose so every studio can write to the same store.
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export type Studio = "bp" | "art" | "music" | "gamedev" | "global";

export interface MemoryRow {
  id: number;
  studio: string;
  kind: string;
  content: string;
  metadata: string;
  created_at: number;
}

export interface MemoryItem {
  id: number;
  studio: string;
  kind: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

function rowToItem(row: MemoryRow): MemoryItem {
  return {
    id: row.id,
    studio: row.studio,
    kind: row.kind,
    content: row.content,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    createdAt: row.created_at,
  };
}

export class MemoryStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studio TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_studio ON memories(studio);
    `);
  }

  /**
   * Store a memory item.
   * studio: 'bp' | 'art' | 'music' | 'gamedev' | 'global'
   * kind: free-form tag, e.g. 'idea', 'style_pref', 'project_state', 'song_lyric'
   */
  add(
    studio: Studio | string,
    kind: string,
    content: string,
    metadata: Record<string, unknown> = {}
  ): number {
    const stmt = this.db.prepare(
      "INSERT INTO memories (studio, kind, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    const info = stmt.run(studio, kind, content, JSON.stringify(metadata), Date.now() / 1000);
    return Number(info.lastInsertRowid);
  }

  /**
   * Naive keyword search across stored memories. Case-insensitive substring match.
   * Replace with vector similarity search when you're ready for semantic recall.
   */
  search(query: string, studio?: string, limit = 10): MemoryItem[] {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.trim().length > 0);

    const rows: MemoryRow[] = studio
      ? (this.db
          .prepare("SELECT * FROM memories WHERE studio = ? ORDER BY created_at DESC")
          .all(studio) as MemoryRow[])
      : (this.db.prepare("SELECT * FROM memories ORDER BY created_at DESC").all() as MemoryRow[]);

    const scored = rows
      .map((row) => {
        const text = row.content.toLowerCase();
        const score = terms.reduce((acc, t) => acc + (text.includes(t) ? 1 : 0), 0);
        return { score, row };
      })
      .filter(({ score }) => score > 0 || terms.length === 0);

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(({ row }) => rowToItem(row));
  }

  recent(studio?: string, kind?: string, limit = 20): MemoryItem[] {
    let query = "SELECT * FROM memories WHERE 1=1";
    const params: (string | number)[] = [];

    if (studio) {
      query += " AND studio = ?";
      params.push(studio);
    }
    if (kind) {
      query += " AND kind = ?";
      params.push(kind);
    }
    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as MemoryRow[];
    return rows.map(rowToItem);
  }

  delete(id: number): boolean {
    const info = this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    return info.changes > 0;
  }

  count(studio?: string): number {
    if (studio) {
      const res = this.db.prepare("SELECT COUNT(*) as cnt FROM memories WHERE studio = ?").get(studio) as { cnt: number };
      return res.cnt;
    }
    const res = this.db.prepare("SELECT COUNT(*) as cnt FROM memories").get() as { cnt: number };
    return res.cnt;
  }
}
