import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { ClaudeMdMemory } from './ClaudeMdMemory.js';
import { getSharedSessionStore, initSharedSessionStore } from './SessionStore.js';
import { getGlobalConfig } from '../utils/config.js';
import { logForDebugging } from '../utils/debug.js';
import { getHermesPluginDataDir } from '../utils/paths.js';
import { UnifiedDatabase } from '../utils/sqliteAdapter.js';
class LocalVectorStore {
    db;
    constructor() {
        const dbPath = join(getHermesPluginDataDir(), 'hermes_vector_memory.db');
        mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
        this.db = new UnifiedDatabase(dbPath);
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS vectors (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_vectors_created ON vectors(created_at DESC);
    `);
    }
    search(query, limit = 10) {
        try {
            const rows = this.db.prepare(`SELECT * FROM vectors ORDER BY created_at DESC LIMIT 1000;`).all();
            const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
            return rows
                .map(r => {
                const contentTerms = r.content.toLowerCase().split(/\s+/).filter(Boolean);
                let matches = 0;
                for (const term of queryTerms) {
                    if (contentTerms.some(c => c.includes(term)))
                        matches++;
                }
                const similarity = queryTerms.length > 0 ? matches / queryTerms.length : 0;
                return { ...r, similarity };
            })
                .filter(r => r.similarity > 0)
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, limit);
        }
        catch (e) {
            logForDebugging(`LocalVectorStore.search failed: ${e instanceof Error ? e.message : String(e)}`, { level: 'error' });
            return [];
        }
    }
    save(id, content, metadata) {
        try {
            const now = Date.now();
            this.db.prepare(`INSERT OR REPLACE INTO vectors(id, content, embedding, metadata, created_at) VALUES (?, ?, ?, ?, ?);`)
                .run(id, content, '[]', metadata ? JSON.stringify(metadata) : null, now);
        }
        catch (e) {
            logForDebugging(`LocalVectorStore.save failed: ${e instanceof Error ? e.message : String(e)}`, { level: 'error' });
        }
    }
}
function checkExternalProviderConsent(providerName) {
    const allowed = process.env.HERMES_ALLOW_EXTERNAL_MEMORY?.trim().toLowerCase();
    if (allowed !== 'true') {
        throw new Error(`Hermes ${providerName} memory provider requires explicit user consent. ` +
            `Set environment variable HERMES_ALLOW_EXTERNAL_MEMORY=true to allow sending conversation data to external memory services.`);
    }
}
// Real Honcho integration using @honcho-ai/sdk
class HonchoProvider {
    client = null;
    apiKey;
    constructor() {
        checkExternalProviderConsent('Honcho');
        this.apiKey = process.env.HONCHO_API_KEY;
    }
    async getClient() {
        if (this.client)
            return this.client;
        if (!this.apiKey) {
            throw new Error('HONCHO_API_KEY is required for honcho memory provider.');
        }
        const { Honcho } = await import('@honcho-ai/sdk');
        this.client = new Honcho({ apiKey: this.apiKey });
        return this.client;
    }
    async search(query, limit = 10) {
        const honcho = await this.getClient();
        const messages = await honcho.search(query, { limit });
        return messages.map(m => ({
            id: m.sessionId,
            title: null,
            summary: m.content,
            cwd: typeof m.metadata?.cwd === 'string' ? m.metadata.cwd : null,
            parent_session_id: null,
            created_at: new Date(m.createdAt).getTime(),
            updated_at: new Date(m.createdAt).getTime(),
            rank: 50,
        }));
    }
    async save(sessionId, summary, _messages, cwd, title) {
        const honcho = await this.getClient();
        const session = await honcho.session(sessionId);
        const peer = await honcho.peer('hermes-memory-peer');
        await session.addMessages(peer.message(summary, { metadata: { cwd, title, source: 'hermes-memory-engine' } }));
    }
}
// Real Mem0 integration using mem0ai
class Mem0Provider {
    client = null;
    apiKey;
    constructor() {
        checkExternalProviderConsent('Mem0');
        this.apiKey = process.env.MEM0_API_KEY;
    }
    async getClient() {
        if (this.client)
            return this.client;
        if (!this.apiKey) {
            throw new Error('MEM0_API_KEY is required for mem0 memory provider.');
        }
        const { MemoryClient } = await import('mem0ai');
        this.client = new MemoryClient({ apiKey: this.apiKey });
        return this.client;
    }
    async search(query, limit = 10) {
        const client = await this.getClient();
        const raw = await client.search(query);
        const memories = Array.isArray(raw) ? raw : raw.results ?? [];
        return memories.slice(0, limit).map(m => ({
            id: m.id,
            title: null,
            summary: m.memory ?? '(no memory text)',
            cwd: typeof m.metadata?.cwd === 'string' ? m.metadata.cwd : null,
            parent_session_id: null,
            created_at: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
            updated_at: m.updated_at ? new Date(m.updated_at).getTime() : Date.now(),
            rank: Math.round((m.score ?? 0.5) * 100),
        }));
    }
    async save(sessionId, summary, messages, cwd, title) {
        const client = await this.getClient();
        const payload = [
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'assistant', content: summary },
        ];
        await client.add(payload, { user_id: sessionId, metadata: { cwd, title } });
    }
}
export class MemoryEngine {
    sessionStore = getSharedSessionStore();
    claudeMd = new ClaudeMdMemory();
    provider;
    localVector = null;
    honcho = null;
    mem0 = null;
    constructor(provider) {
        this.provider = provider ?? getGlobalConfig().hermesMemoryProvider ?? 'built-in';
        if (this.provider === 'local-vector') {
            this.localVector = new LocalVectorStore();
        }
        if (this.provider === 'honcho') {
            this.honcho = new HonchoProvider();
        }
        if (this.provider === 'mem0') {
            this.mem0 = new Mem0Provider();
        }
    }
    async init() {
        await initSharedSessionStore();
    }
    async getRelevantSessions(currentCwd, query, limit = 5) {
        if (this.provider === 'built-in') {
            return this.sessionStore.getRelevantSessions(currentCwd, query, limit);
        }
        if (this.provider === 'local-vector' && this.localVector) {
            const results = this.localVector.search(query, limit);
            return results.map(r => ({
                id: r.id,
                title: null,
                summary: r.content,
                cwd: null,
                parent_session_id: null,
                created_at: r.created_at,
                updated_at: r.created_at,
                rank: Math.round(r.similarity * 100),
            }));
        }
        if (this.provider === 'honcho' && this.honcho) {
            return this.honcho.search(query, limit);
        }
        if (this.provider === 'mem0' && this.mem0) {
            return this.mem0.search(query, limit);
        }
        return this.sessionStore.getRelevantSessions(currentCwd, query, limit);
    }
    async searchSessions(query, limit = 10) {
        if (this.provider === 'built-in') {
            return this.sessionStore.searchSessions(query, limit);
        }
        if (this.provider === 'local-vector' && this.localVector) {
            const results = this.localVector.search(query, limit);
            return results.map(r => ({
                id: r.id,
                title: null,
                summary: r.content,
                cwd: null,
                parent_session_id: null,
                created_at: r.created_at,
                updated_at: r.created_at,
                rank: Math.round(r.similarity * 100),
            }));
        }
        if (this.provider === 'honcho' && this.honcho) {
            return this.honcho.search(query, limit);
        }
        if (this.provider === 'mem0' && this.mem0) {
            return this.mem0.search(query, limit);
        }
        return this.sessionStore.searchSessions(query, limit);
    }
    async getSessionSummary(sessionId) {
        return this.sessionStore.getSessionSummary(sessionId);
    }
    saveSession(sessionId, summary, messages, cwd, title) {
        this.sessionStore.saveSession(sessionId, summary, messages, cwd, title);
        if (this.localVector) {
            this.localVector.save(sessionId, summary, { cwd, title, source: 'memory-engine' });
        }
        if (this.honcho) {
            this.honcho.save(sessionId, summary, messages, cwd, title).catch(e => {
                logForDebugging(`HonchoProvider.save failed: ${e instanceof Error ? e.message : String(e)}`, { level: 'error' });
            });
        }
        if (this.mem0) {
            this.mem0.save(sessionId, summary, messages, cwd, title).catch(e => {
                logForDebugging(`Mem0Provider.save failed: ${e instanceof Error ? e.message : String(e)}`, { level: 'error' });
            });
        }
    }
    async getMemoryContext() {
        return this.claudeMd.getMemoryContext();
    }
    getProviderStatus() {
        if (this.provider === 'honcho') {
            return { provider: this.provider, connected: !!process.env.HONCHO_API_KEY };
        }
        if (this.provider === 'mem0') {
            return { provider: this.provider, connected: !!process.env.MEM0_API_KEY };
        }
        return { provider: this.provider, connected: true };
    }
}
let sharedEngine = null;
export function getSharedMemoryEngine() {
    if (!sharedEngine) {
        sharedEngine = new MemoryEngine();
    }
    return sharedEngine;
}
