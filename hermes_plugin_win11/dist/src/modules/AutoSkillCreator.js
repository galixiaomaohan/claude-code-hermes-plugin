import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { logForDebugging } from '../utils/debug.js';
import { getClaudeConfigHomeDir } from '../utils/env.js';
import { sideQuery } from '../utils/sideQuery.js';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
function extractToolNamesFromMessages(messages) {
    const names = new Set();
    for (const m of messages) {
        if (m.type !== 'assistant')
            continue;
        const assistant = m;
        const content = assistant.message?.content;
        if (typeof content === 'string')
            continue;
        if (!Array.isArray(content))
            continue;
        for (const block of content) {
            if (block.type === 'tool_use' && block.name) {
                names.add(block.name);
            }
        }
    }
    return Array.from(names);
}
function extractUserMessages(messages) {
    const texts = [];
    for (const m of messages) {
        if (m.type !== 'user')
            continue;
        const user = m;
        const content = user.message?.content;
        if (typeof content === 'string') {
            texts.push(content);
        }
        else if (Array.isArray(content)) {
            for (const block of content) {
                if (block.type === 'text' && block.text)
                    texts.push(block.text);
            }
        }
    }
    return texts;
}
function sanitizeSkillName(name) {
    const sanitized = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
    if (!sanitized || sanitized === '.' || sanitized === '..') {
        return `auto-skill-${Date.now()}`;
    }
    return sanitized;
}
export class AutoSkillCreator {
    sideQueryFn;
    constructor(sideQueryFn) {
        this.sideQueryFn = sideQueryFn || sideQuery;
    }
    async analyzeAndCreate(messages, opts = {}) {
        const toolNames = extractToolNamesFromMessages(messages);
        const userMessages = extractUserMessages(messages);
        const systemPrompt = `You are an expert at extracting reusable skills from conversation transcripts.
Analyze the conversation and produce a SKILL.md file with proper frontmatter.
Frontmatter must include:
- name: kebab-case skill name
- description: one-line description
- allowed-tools: list of minimal tool permission patterns ACTUALLY OBSERVED in the conversation (e.g., Read, Edit, Bash). NEVER grant Bash unless it was explicitly used. Default to Read only if no tools were used.
- when_to_use: detailed trigger description starting with "Use when..."
- arguments: optional list of argument names if parameterized
- model: optional model override (omit for default)
- effort: optional effort level (omit for default)

Respond ONLY with the SKILL.md content (including frontmatter delimiters). Do not wrap in markdown code blocks.`;
        const transcript = userMessages.slice(-20).join('\n\n---\n\n');
        const userPrompt = `Conversation transcript (last ${Math.min(userMessages.length, 20)} user messages):\n\n${transcript}\n\nTools used: ${toolNames.join(', ') || 'none'}`;
        let skillMarkdown;
        try {
            const response = await this.sideQueryFn({
                querySource: 'skill_creation',
                model: process.env.CLAUDE_HERMES_SKILL_MODEL || DEFAULT_MODEL,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
                max_tokens: 2048,
                temperature: 0.3,
            });
            const textBlocks = response.content.filter(b => b.type === 'text');
            skillMarkdown = textBlocks.map(b => b.text).join('\n').trim();
        }
        catch (e) {
            logForDebugging(`AutoSkillCreator LLM call failed, using fallback: ${e instanceof Error ? e.message : String(e)}`, { level: 'error' });
            const lastUserMessage = userMessages[userMessages.length - 1] || 'auto-skill';
            const fallbackName = sanitizeSkillName(lastUserMessage.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40));
            const observedTools = toolNames.length > 0 ? toolNames : ['Read'];
            const toolsYaml = observedTools.map(t => `  - ${t}`).join('\n');
            skillMarkdown = `---\nname: ${fallbackName}\ndescription: Auto-created skill from conversation\nallowed-tools:\n${toolsYaml}\nwhen_to_use: Use when the user asks for similar tasks.\n---\n\n# ${fallbackName.replace(/-/g, ' ')}\n\nFollow the conversation pattern observed.\n`;
        }
        if (!skillMarkdown.includes('---')) {
            logForDebugging('AutoSkillCreator: generated content missing frontmatter');
            return null;
        }
        const nameMatch = skillMarkdown.match(/^---\s*\n[\s\S]*?^name:\s*(.+)$/m);
        const skillName = nameMatch?.[1]?.trim() || `auto-skill-${Date.now()}`;
        const safeName = sanitizeSkillName(skillName);
        const baseDir = opts.targetDir === 'user'
            ? join(getClaudeConfigHomeDir(), 'skills')
            : join(opts.projectCwd || process.cwd(), '.claude', 'skills');
        const skillDir = join(baseDir, safeName);
        const skillPath = join(skillDir, 'SKILL.md');
        await mkdir(skillDir, { recursive: true, mode: 0o700 });
        await writeFile(skillPath, skillMarkdown, { mode: 0o600 });
        const fmMatch = skillMarkdown.match(/^---\s*\n([\s\S]*?)\n---/);
        const frontmatter = fmMatch?.[1] || '';
        logForDebugging(`AutoSkillCreator: wrote skill to ${skillPath}`);
        return { skillPath, frontmatter };
    }
}
export function getAutoSkillCreator(sideQueryFn) {
    return new AutoSkillCreator(sideQueryFn);
}
