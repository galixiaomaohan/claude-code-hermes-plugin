import Anthropic from '@anthropic-ai/sdk';
import { logForDebugging } from './debug.js';
function checkUserConsent() {
    const allowed = process.env.HERMES_ALLOW_SIDE_QUERY?.trim().toLowerCase();
    if (allowed !== 'true') {
        throw new Error('Hermes sideQuery requires explicit user consent. Set environment variable HERMES_ALLOW_SIDE_QUERY=true to allow sending conversation data to external LLM APIs.');
    }
}
function getAnthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY;
}
export async function sideQuery(opts) {
    checkUserConsent();
    const apiKey = getAnthropicApiKey();
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is required for Hermes sideQuery.');
    }
    const client = new Anthropic({ apiKey });
    const systemBlocks = Array.isArray(opts.system)
        ? opts.system
        : opts.system
            ? [{ type: 'text', text: opts.system }]
            : [];
    try {
        const response = await client.messages.create({
            model: opts.model,
            max_tokens: opts.max_tokens ?? 1024,
            system: systemBlocks.length > 0 ? systemBlocks : undefined,
            messages: opts.messages,
            tools: opts.tools,
            tool_choice: opts.tool_choice,
            temperature: opts.temperature,
            stop_sequences: opts.stop_sequences,
        });
        logForDebugging(`sideQuery ${opts.querySource} succeeded with model ${opts.model}`);
        return response;
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logForDebugging(`sideQuery ${opts.querySource} failed: ${msg}`, { level: 'error' });
        throw e;
    }
}
