import { describe, it, beforeEach, afterEach } from 'node:test';
import { strictEqual, ok } from 'node:assert/strict';
import { rejects } from 'node:assert';
import { MemoryEngine } from '../src/modules/MemoryEngine.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
describe('MemoryEngine', () => {
    let tmpDir;
    let originalFetch;
    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'hermes-mem-test-'));
        process.env.CLAUDE_CONFIG_DIR = tmpDir;
        process.env.HERMES_ALLOW_EXTERNAL_MEMORY = 'true';
        originalFetch = global.fetch;
    });
    afterEach(() => {
        delete process.env.CLAUDE_CONFIG_DIR;
        delete process.env.HERMES_ALLOW_EXTERNAL_MEMORY;
        delete process.env.HONCHO_API_KEY;
        delete process.env.MEM0_API_KEY;
        global.fetch = originalFetch;
        rmSync(tmpDir, { recursive: true, force: true });
    });
    it('built-in provider works end to end', async () => {
        const engine = new MemoryEngine('built-in');
        await engine.init();
        engine.saveSession('mem-1', 'Memory test summary', [{ role: 'user', content: 'hello' }], '/cwd', 'Test');
        const results = await engine.searchSessions('test', 5);
        ok(results.length >= 1);
        strictEqual(results[0].summary, 'Memory test summary');
    });
    it('local-vector provider searches saved content', async () => {
        const engine = new MemoryEngine('local-vector');
        await engine.init();
        engine.saveSession('mem-2', 'Vector store content', [{ role: 'user', content: 'data' }], '/cwd', 'Vector');
        const results = await engine.searchSessions('vector', 5);
        ok(results.length >= 1);
    });
    it('honcho provider makes real API calls when key is present', async () => {
        process.env.HONCHO_API_KEY = 'test-honcho-key';
        const fetchCalls = [];
        global.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : input.toString();
            fetchCalls.push({ url, options: init || {} });
            // Workspace get-or-create
            if (url.includes('/search')) {
                return new Response(JSON.stringify([
                    { id: 'msg-1', content: 'Honcho search result', session_id: 'mem-3', workspace_id: 'ws-default', peer_id: 'hermes-memory-peer', metadata: {}, created_at: new Date().toISOString(), token_count: 10 }
                ]), { status: 200 });
            }
            if (url.includes('/workspaces/')) {
                return new Response(JSON.stringify({ id: 'ws-default', name: 'default' }), { status: 200 });
            }
            // Peer get-or-create
            if (url.includes('/peers/')) {
                return new Response(JSON.stringify({ id: 'hermes-memory-peer', workspace_id: 'ws-default' }), { status: 200 });
            }
            // Session get-or-create
            if (url.includes('/sessions/')) {
                return new Response(JSON.stringify({ id: 'mem-3', workspace_id: 'ws-default' }), { status: 200 });
            }
            // Session add messages
            if (url.includes('/messages')) {
                return new Response(JSON.stringify([{ id: 'msg-1', content: 'Honcho summary', peer_id: 'hermes-memory-peer', session_id: 'mem-3' }]), { status: 200 });
            }
            // Search
            if (url.includes('/search')) {
                return new Response(JSON.stringify([
                    { id: 'msg-1', content: 'Honcho search result', session_id: 'mem-3', workspace_id: 'ws-default', peer_id: 'hermes-memory-peer', metadata: {}, created_at: new Date().toISOString(), token_count: 10 }
                ]), { status: 200 });
            }
            return new Response(JSON.stringify({}), { status: 200 });
        };
        const engine = new MemoryEngine('honcho');
        await engine.init();
        engine.saveSession('mem-3', 'Honcho summary', [], '/cwd');
        // Allow async save to complete
        await new Promise(r => setTimeout(r, 100));
        const results = await engine.searchSessions('fallback', 5);
        ok(results.length >= 1);
        strictEqual(results[0].summary, 'Honcho search result');
        ok(fetchCalls.length >= 1);
    });
    it('honcho provider throws without API key', async () => {
        delete process.env.HONCHO_API_KEY;
        const engine = new MemoryEngine('honcho');
        await engine.init();
        await rejects(engine.searchSessions('test', 5), { message: /HONCHO_API_KEY is required/ });
    });
    it('mem0 provider makes real API calls when key is present', async () => {
        process.env.MEM0_API_KEY = 'test-mem0-key';
        const fetchCalls = [];
        global.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : input.toString();
            fetchCalls.push({ url, options: init || {} });
            // Mem0 search must come before general /memories/ POST matcher
            if (url.includes('/memories/search/')) {
                return new Response(JSON.stringify({
                    results: [
                        { id: 'mem-4', memory: 'Mem0 search result', user_id: 'mem-4', score: 0.85, created_at: new Date().toISOString() }
                    ]
                }), { status: 200 });
            }
            if (url.includes('/memories/') && init?.method === 'POST') {
                return new Response(JSON.stringify({ id: 'mem-4', memory: 'Mem0 saved' }), { status: 200 });
            }
            // Ping during initialization
            if (url.includes('/ping/')) {
                return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
            }
            return new Response(JSON.stringify({}), { status: 200 });
        };
        const engine = new MemoryEngine('mem0');
        await engine.init();
        engine.saveSession('mem-4', 'Mem0 summary', [{ role: 'user', content: 'hi' }], '/cwd');
        // Allow async save to complete
        await new Promise(r => setTimeout(r, 100));
        const results = await engine.searchSessions('fallback', 5);
        ok(results.length >= 1);
        strictEqual(results[0].summary, 'Mem0 search result');
        ok(fetchCalls.length >= 1);
    });
    it('mem0 provider throws without API key', async () => {
        delete process.env.MEM0_API_KEY;
        const engine = new MemoryEngine('mem0');
        await engine.init();
        await rejects(engine.searchSessions('test', 5), { message: /MEM0_API_KEY is required/ });
    });
});
