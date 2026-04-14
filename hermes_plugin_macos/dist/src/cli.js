#!/usr/bin/env node
import { hermesSkillDefinitions } from './index.js';
import { resolve, normalize, sep } from 'path';
import { tmpdir, homedir } from 'os';
function isPathInsideAllowed(contextPath) {
    const resolved = normalize(resolve(contextPath));
    const allowedRoots = [
        normalize(resolve(tmpdir())),
        normalize(resolve(process.env.TEMP || tmpdir())),
        normalize(resolve(process.env.TMP || tmpdir())),
        normalize(resolve(homedir(), '.claude')),
        normalize(resolve(homedir())),
        normalize(resolve(process.cwd())),
    ];
    return allowedRoots.some(root => {
        if (resolved === root)
            return true;
        // Use platform-specific separator for prefix check
        return resolved.startsWith(root + sep);
    });
}
async function main() {
    const command = process.argv[2];
    const args = process.argv[3] || '';
    const contextPath = process.argv[4];
    const skill = hermesSkillDefinitions.find(s => s.name === command);
    if (!skill) {
        console.error(`Unknown Hermes command: ${command}`);
        console.error(`Available: ${hermesSkillDefinitions.map(s => s.name).join(', ')}`);
        process.exit(1);
    }
    let context = {
        messages: [],
        sessionId: 'cli',
        model: 'unknown',
    };
    if (contextPath) {
        if (!isPathInsideAllowed(contextPath)) {
            console.error(`Security validation failed: context path ${contextPath} is outside allowed directories.`);
            process.exit(1);
        }
        try {
            const file = await import('fs/promises').then(m => m.readFile(contextPath, 'utf-8'));
            const parsed = JSON.parse(file);
            context = { ...context, ...parsed };
        }
        catch (e) {
            console.error(`Failed to read context from ${contextPath}:`, e instanceof Error ? e.message : String(e));
            process.exit(1);
        }
    }
    const prompt = await skill.getPromptForCommand(args, context);
    console.log(JSON.stringify({ success: true, prompt }));
}
main().catch(e => {
    console.error(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }));
    process.exit(1);
});
