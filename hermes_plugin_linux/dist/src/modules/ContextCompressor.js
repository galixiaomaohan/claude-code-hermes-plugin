import { logForDebugging } from '../utils/debug.js';
import { sideQuery } from '../utils/sideQuery.js';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
function roughTokenCountEstimation(content) {
    return Math.round(content.length / 4);
}
function roughTokenCountEstimationForMessages(messages) {
    let total = 0;
    for (const m of messages) {
        if ((m.type === 'assistant' || m.type === 'user') && m.message?.content) {
            const content = m.message.content;
            if (typeof content === 'string') {
                total += roughTokenCountEstimation(content);
            }
            else if (Array.isArray(content)) {
                for (const block of content) {
                    if (typeof block === 'object' && block !== null) {
                        if ('text' in block && typeof block.text === 'string') {
                            total += roughTokenCountEstimation(block.text);
                        }
                        else {
                            total += roughTokenCountEstimation(JSON.stringify(block));
                        }
                    }
                }
            }
        }
    }
    return total;
}
export class ContextCompressor {
    modelContextLimit;
    preserveRecentTurns;
    sideQueryFn;
    constructor(modelContextLimit = 200_000, preserveRecentTurns = 5, sideQueryFn) {
        this.modelContextLimit = modelContextLimit;
        this.preserveRecentTurns = preserveRecentTurns;
        this.sideQueryFn = sideQueryFn || sideQuery;
    }
    async compress(messages) {
        if (messages.length <= this.preserveRecentTurns + 1) {
            return messages;
        }
        const estimatedTokens = roughTokenCountEstimationForMessages(messages);
        if (estimatedTokens < this.modelContextLimit * 0.85) {
            return messages;
        }
        const systemMessages = [];
        const otherMessages = [];
        for (const m of messages) {
            if (m.type === 'system') {
                systemMessages.push(m);
            }
            else {
                otherMessages.push(m);
            }
        }
        const recent = otherMessages.slice(-this.preserveRecentTurns);
        const older = otherMessages.slice(0, -this.preserveRecentTurns);
        if (older.length === 0) {
            return messages;
        }
        try {
            const summary = await this.summarizeOlderMessages(older);
            const summaryMessage = {
                type: 'user',
                message: {
                    content: `[Earlier conversation summary]:\n${summary}`,
                },
            };
            return [...systemMessages, summaryMessage, ...recent];
        }
        catch (e) {
            logForDebugging(`ContextCompressor.compress failed: ${e instanceof Error ? e.message : String(e)}`, { level: 'error' });
            return messages;
        }
    }
    async summarizeOlderMessages(messages) {
        const transcript = messages
            .map(m => {
            const msg = m;
            if (m.type === 'user') {
                const content = typeof msg.message?.content === 'string' ? msg.message.content : JSON.stringify(msg.message?.content);
                return `User: ${content.slice(0, 800)}`;
            }
            if (m.type === 'assistant') {
                const content = typeof msg.message?.content === 'string' ? msg.message.content : JSON.stringify(msg.message?.content);
                const toolUses = Array.isArray(msg.message?.content)
                    ? msg.message.content
                        .filter(b => b.type === 'tool_use')
                        .map(b => `[tool_use ${b.name ?? ''}]`)
                        .join(' ')
                    : '';
                return `Assistant: ${content.slice(0, 800)}${toolUses ? ' ' + toolUses : ''}`;
            }
            return `${m.type}: ${JSON.stringify(m).slice(0, 400)}`;
        })
            .join('\n\n');
        const systemPrompt = `Summarize the following conversation excerpt into a concise structured summary.
Include: Goal, Key Decisions, Relevant Files, and Progress. Be brief.`;
        const response = await this.sideQueryFn({
            querySource: 'context_compressor',
            model: process.env.CLAUDE_HERMES_COMPRESSOR_MODEL || DEFAULT_MODEL,
            system: systemPrompt,
            messages: [{ role: 'user', content: transcript }],
            max_tokens: 1024,
            temperature: 0.2,
        });
        const textBlocks = response.content.filter(b => b.type === 'text');
        return textBlocks.map(b => b.text).join('\n').trim();
    }
}
export function getContextCompressor() {
    return new ContextCompressor();
}
