import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { getHermesPluginDataDir } from '../utils/paths.js';
import { logForDebugging } from '../utils/debug.js';
import { UnifiedDatabase } from '../utils/sqliteAdapter.js';
const DB_VERSION = 1;
const DEFAULT_RETENTION_DAYS = 90;
function getDbPath() {
    return join(getHermesPluginDataDir(), 'session_store.db');
}
function getRetentionDays() {
    const env = process.env.HERMES_DATA_RETENTION_DAYS;
    if (env) {
        const parsed = parseInt(env, 10);
        if (!isNaN(parsed) && parsed >= 0)
            return parsed;
    }
    return DEFAULT_RETENTION_DAYS;
}
export class SessionStore {
    db;
    ready;
    constructor(dbPath) {
        const resolvedDbPath = dbPath ?? getDbPath();
        mkdirSync(dirname(resolvedDbPath), { recursive: true, mode: 0o700 });
        this.db = new UnifiedDatabase(resolvedDbPath);
        this.ready = false;
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec('PRAGMA foreign_keys = ON;');
    }
    async init() {
        if (this.ready)
            return;
        this.runMigrations();
        this.pruneOldSessions();
        this.ready = true;
    }
    runMigrations() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        summary TEXT,
        cwd TEXT,
        parent_session_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_calls TEXT,
        tool_results TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_cwd ON sessions(cwd);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
    `);
        const ftsCheck = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts';`);
        const hasFts = ftsCheck.get() !== null;
        if (!hasFts) {
            try {
                this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
            session_id UNINDEXED,
            content,
            tokenize='porter'
          );

          CREATE TRIGGER IF NOT EXISTS trg_messages_insert AFTER INSERT ON messages BEGIN
            INSERT INTO messages_fts(session_id, content) VALUES (NEW.session_id, NEW.content);
          END;

          CREATE TRIGGER IF NOT EXISTS trg_messages_delete AFTER DELETE ON messages BEGIN
            DELETE FROM messages_fts WHERE rowid IN (
              SELECT rowid FROM messages_fts WHERE session_id = OLD.session_id AND content = OLD.content
            );
          END;

          CREATE TRIGGER IF NOT EXISTS trg_messages_update AFTER UPDATE ON messages BEGIN
            DELETE FROM messages_fts WHERE rowid IN (
              SELECT rowid FROM messages_fts WHERE session_id = OLD.session_id AND content = OLD.content
            );
            INSERT INTO messages_fts(session_id, content) VALUES (NEW.session_id, NEW.content);
          END;
        `);
            }
            catch (e) {
                logForDebugging(`FTS5 not available for messages: ${e instanceof Error ? e.message : String(e)}`, { level: 'warn' });
            }
        }
        const summaryFtsCheck = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='sessions_fts';`);
        const hasSummaryFts = summaryFtsCheck.get() !== null;
        if (!hasSummaryFts) {
            try {
                this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
            session_id UNINDEXED,
            title,
            summary,
            tokenize='porter'
          );

          CREATE TRIGGER IF NOT EXISTS trg_sessions_insert AFTER INSERT ON sessions BEGIN
            INSERT INTO sessions_fts(session_id, title, summary) VALUES (NEW.id, NEW.title, NEW.summary);
          END;

          CREATE TRIGGER IF NOT EXISTS trg_sessions_delete AFTER DELETE ON sessions BEGIN
            DELETE FROM sessions_fts WHERE rowid IN (
              SELECT rowid FROM sessions_fts WHERE session_id = OLD.id
            );
          END;

          CREATE TRIGGER IF NOT EXISTS trg_sessions_update AFTER UPDATE ON sessions BEGIN
            DELETE FROM sessions_fts WHERE rowid IN (
              SELECT rowid FROM sessions_fts WHERE session_id = OLD.id
            );
            INSERT INTO sessions_fts(session_id, title, summary) VALUES (NEW.id, NEW.title, NEW.summary);
          END;
        `);
            }
            catch (e) {
                logForDebugging(`FTS5 not available for sessions: ${e instanceof Error ? e.message : String(e)}`, { level: 'warn' });
            }
        }
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );
    `);
        const versionRow = this.db.prepare(`SELECT version FROM schema_version LIMIT 1;`).get();
        const currentVersion = versionRow?.version ?? 0;
        if (currentVersion < DB_VERSION) {
            this.db.prepare(`INSERT OR REPLACE INTO schema_version(version) VALUES (?);`).run(DB_VERSION);
        }
    }
    pruneOldSessions() {
        const retentionDays = getRetentionDays();
        if (retentionDays <= 0)
            return;
        try {
            const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
            const result = this.db.prepare(`DELETE FROM sessions WHERE updated_at < ?;`).run(cutoff);
            if (result.changes > 0) {
                logForDebugging(`Pruned ${result.changes} old sessions (older than ${retentionDays} days)`);
            }
        }
        catch (e) {
            logForDebugging(`SessionStore.pruneOldSessions failed: ${e instanceof Error ? e.message : String(e)}`, { level: 'warn' });
        }
    }
    saveSession(sessionId, summary, messages, cwd, title, parentSessionId) {
        try {
            const now = Date.now();
            const insertSession = this.db.prepare(`INSERT OR REPLACE INTO sessions(id, title, summary, cwd, parent_session_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`);
            const existing = this.db.prepare(`SELECT created_at FROM sessions WHERE id = ?;`).get(sessionId);
            const createdAt = existing?.created_at ?? now;
            insertSession.run(sessionId, title ?? null, summary, cwd, parentSessionId ?? null, createdAt, now);
            this.db.prepare(`DELETE FROM messages WHERE session_id = ?;`).run(sessionId);
            const insertMessage = this.db.prepare(`INSERT INTO messages(session_id, role, content, tool_calls, tool_results, created_at)
         VALUES (?, ?, ?, ?, ?, ?);`);
            for (let i = 0; i < messages.length; i++) {
                const m = messages[i];
                insertMessage.run(sessionId, m.role, typeof m.content === 'string' ? m.content : JSON.stringify(m.content), m.tool_calls ? JSON.stringify(m.tool_calls) : null, m.tool_results ? JSON.stringify(m.tool_results) : null, now + i);
            }
            this.pruneOldSessions();
        }
        catch (e) {
            logForDebugging(`SessionStore.saveSession failed: ${e instanceof Error ? e.message : String(e)}`, { level: 'error' });
        }
    }
    searchSessions(query, limit = 10) {
        try {
            const sql = this.db.prepare(`
        SELECT s.*, rank
        FROM sessions_fts
        JOIN sessions s ON sessions_fts.session_id = s.id
        WHERE sessions_fts MATCH ?
        ORDER BY rank
        LIMIT ?;
      `);
            return sql.all(query, limit);
        }
        catch (e) {
            logForDebugging(`SessionStore.searchSessions failed: ${e instanceof Error ? e.message : String(e)}`, { level: 'error' });
            try {
                const fallback = this.db.prepare(`
          SELECT * FROM sessions
          WHERE title LIKE ? OR summary LIKE ?
          ORDER BY updated_at DESC
          LIMIT ?;
        `);
                const likeQuery = `%${query}%`;
                return fallback.all(likeQuery, likeQuery, limit).map(r => ({ ...r, rank: 0 }));
            }
            catch {
                return [];
            }
        }
    }
    getSessionSummary(sessionId) {
        try {
            const row = this.db.prepare(`SELECT summary FROM sessions WHERE id = ?;`).get(sessionId);
            return row?.summary ?? null;
        }
        catch (e) {
            logForDebugging(`SessionStore.getSessionSummary failed: ${e instanceof Error ? e.message : String(e)}`, { level: 'error' });
            return null;
        }
    }
    getRelevantSessions(currentCwd, query, limit = 5) {
        try {
            const byText = this.searchSessions(query, limit * 3);
            const byCwd = this.db.prepare(`
        SELECT * FROM sessions
        WHERE cwd = ? OR ? LIKE cwd || '%'
        ORDER BY updated_at DESC
        LIMIT ?;
      `);
            const cwdRows = byCwd.all(currentCwd, currentCwd, limit);
            const map = new Map();
            for (const row of byText) {
                map.set(row.id, row);
            }
            for (const row of cwdRows) {
                if (!map.has(row.id)) {
                    map.set(row.id, { ...row, rank: 0 });
                }
            }
            return Array.from(map.values())
                .sort((a, b) => {
                const cwdBoostA = a.cwd && (a.cwd === currentCwd || currentCwd.startsWith(a.cwd)) ? -1000 : 0;
                const cwdBoostB = b.cwd && (b.cwd === currentCwd || currentCwd.startsWith(b.cwd)) ? -1000 : 0;
                return (a.rank + cwdBoostA) - (b.rank + cwdBoostB);
            })
                .slice(0, limit);
        }
        catch (e) {
            logForDebugging(`SessionStore.getRelevantSessions failed: ${e instanceof Error ? e.message : String(e)}`, { level: 'error' });
            return [];
        }
    }
    close() {
        this.db.close();
    }
}
let sharedStore = null;
export function getSharedSessionStore() {
    if (!sharedStore) {
        sharedStore = new SessionStore();
    }
    return sharedStore;
}
export async function initSharedSessionStore() {
    const store = getSharedSessionStore();
    await store.init();
}
