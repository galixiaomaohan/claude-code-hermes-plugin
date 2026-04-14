import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert/strict';
import { ContextCompressor } from '../src/modules/ContextCompressor.js';
describe('ContextCompressor', () => {
    it('compress invokes LLM when message count exceeds threshold', async () => {
        const mockSideQuery = async () => ({
            id: 'msg-test',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Summary: user asked for TypeScript help and received fixes.' }],
            model: 'claude-sonnet-4-6',
            stop_reason: 'end_turn',
            usage: { input_tokens: 20, output_tokens: 15 },
        });
        // Set very low thresholds to force compression with a small message set
        const compressor = new ContextCompressor(100, 1, mockSideQuery);
        const messages = [
            { type: 'user', message: { content: 'a'.repeat(400) } },
            { type: 'assistant', message: { content: 'b'.repeat(400) } },
            { type: 'user', message: { content: 'c'.repeat(400) } },
            { type: 'assistant', message: { content: 'd'.repeat(400) } },
            { type: 'user', message: { content: 'e'.repeat(400) } },
            { type: 'assistant', message: { content: 'f'.repeat(400) } },
        ];
        const result = await compressor.compress(messages);
        // Result should contain a summary message plus the preserved recent turns
        ok(result.length >= 2);
        const summaryMessage = result.find(m => m.type === 'user' && typeof m.message?.content === 'string' && m.message.content.includes('[Earlier conversation summary]'));
        ok(summaryMessage !== undefined);
        ok(summaryMessage.message.content.includes('Summary: user asked for TypeScript help and received fixes.'));
    });
    it('compress returns messages unchanged when under threshold', async () => {
        const mockSideQuery = async () => {
            throw new Error('sideQuery should not be called when under threshold');
        };
        const compressor = new ContextCompressor(200_000, 5, mockSideQuery);
        const messages = [
            { type: 'user', message: { content: 'short message' } },
            { type: 'assistant', message: { content: 'short reply' } },
        ];
        const result = await compressor.compress(messages);
        strictEqual(JSON.stringify(result), JSON.stringify(messages));
    });
});
