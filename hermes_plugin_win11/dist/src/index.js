import { join } from 'path';
import { getAutoSkillCreator } from './modules/AutoSkillCreator.js';
import { getSkillOptimizer } from './modules/SkillOptimizer.js';
import { getSkillHubClient } from './modules/SkillHubClient.js';
import { getSharedMemoryEngine } from './modules/MemoryEngine.js';
import { getContextCompressor } from './modules/ContextCompressor.js';
import { getTrajectoryLogger } from './modules/TrajectoryLogger.js';
import { getGlobalConfig } from './modules/config.js';
import { getCwd } from './modules/cwd.js';
function textBlock(text) {
    return [{ type: 'text', text }];
}
async function skillsHubPrompt(args) {
    const hub = getSkillHubClient();
    const skills = await hub.listSkills();
    const query = args.trim().toLowerCase();
    const filtered = query
        ? skills.filter(s => s.name.toLowerCase().includes(query) ||
            s.description.toLowerCase().includes(query))
        : skills;
    const list = filtered.map(s => `- ${s.name}: ${s.description}`).join('\n');
    return textBlock(`## Hermes Skills Hub\n\nAvailable skills:\n\n${list || '(none found)'}\n\nTo install a skill, run:\n\`/hermes:skills-hub <skill-name>\`\n\nOr tell me which skill you'd like to install and I can do it for you using Bash.`);
}
async function createSkillPrompt(_args, context) {
    const creator = getAutoSkillCreator();
    const messages = (context.messages || []);
    const result = await creator.analyzeAndCreate(messages, {
        targetDir: 'project',
        projectCwd: getCwd(),
    });
    if (!result) {
        return textBlock('Could not auto-create a skill from the recent conversation. Try providing more context or examples.');
    }
    return textBlock(`Auto-created skill at **${result.skillPath}**.\n\nFrontmatter:\n\`\`\`yaml\n${result.frontmatter}\n\`\`\`\n\nThe skill is now available in the project skills directory.`);
}
async function optimizeSkillPrompt(args) {
    const skillName = args.trim();
    if (!skillName) {
        return textBlock('Please provide a skill name: `/hermes:optimize-skill <skill-name>`');
    }
    const optimizer = getSkillOptimizer();
    const cwd = getCwd();
    const skillPath = join(cwd, '.claude', 'skills', skillName, 'SKILL.md');
    const should = await optimizer.shouldOptimize(skillName);
    if (!should) {
        return textBlock(`Skill "${skillName}" does not have enough usage data to optimize yet (threshold: 10 calls).`);
    }
    const ok = await optimizer.optimizeSkill(skillName, skillPath);
    if (!ok) {
        return textBlock(`Optimization skipped for "${skillName}" (feedback is mostly positive or an error occurred).`);
    }
    return textBlock(`Skill "${skillName}" has been optimized at **${skillPath}**.`);
}
async function memorySearchPrompt(args) {
    const query = args.trim();
    if (!query) {
        return textBlock('Please provide a search query: `/hermes:memory-search <query>`');
    }
    const engine = getSharedMemoryEngine();
    await engine.init();
    const sessions = await engine.searchSessions(query, 5);
    const list = sessions
        .map((s, i) => `${i + 1}. **${s.id}** — ${new Date(s.updated_at).toLocaleString()}\n   ${s.summary || '(no summary)'}`)
        .join('\n\n');
    return textBlock(`## Hermes Memory Search Results for "${query}"\n\n${list || 'No matching sessions found.'}`);
}
async function compressContextPrompt(_args, context) {
    const compressor = getContextCompressor();
    const messages = (context.messages || []);
    const compressed = await compressor.compress(messages);
    if (!compressed || compressed.length === 0) {
        return textBlock('Context compression returned no results. The conversation may be too short to compress.');
    }
    const summary = compressed
        .map(m => {
        const msg = m;
        const content = typeof msg.message?.content === 'string'
            ? msg.message.content
            : JSON.stringify(msg.message?.content);
        return `**${m.type}**: ${content.slice(0, 500)}${content.length > 500 ? '...' : ''}`;
    })
        .join('\n\n---\n\n');
    return textBlock(`## Compressed Context\n\n${summary}\n\nThis summary preserves tool-use context and key decisions.`);
}
async function logTrajectoryPrompt(_args, context) {
    const logger = getTrajectoryLogger();
    const messages = context.messages || [];
    const model = context.model || 'unknown';
    await logger.log(context.sessionId || 'manual', model, messages, [], 'Manual trajectory log triggered via /hermes:log-trajectory');
    return textBlock('Current conversation trajectory has been logged to the Hermes training bridge.');
}
async function statusPrompt() {
    const cfg = getGlobalConfig();
    const cwd = getCwd();
    const lines = [
        '## Hermes Self-Learning Status',
        '',
        `**Project CWD**: ${cwd}`,
        `**Memory Provider**: ${cfg.hermesMemoryProvider ?? 'built-in'}`,
        `**Auto-Skill Creation**: ${cfg.hermesSkillsAutoCreate === true ? 'enabled' : 'disabled'}`,
        `**Skills Hub URL**: ${cfg.hermesSkillsHubUrl ?? '(default)'}`,
        `**Trajectory Dir**: ${cfg.hermesTrainingTrajectoryDir ?? '(default)'}`,
        '',
        'All core modules are active:',
        '- Skills Hub',
        '- Auto-Skill Creation',
        '- Skill Self-Improvement',
        '- Multi-Provider Memory',
        '- Context Intelligence',
        '- Training Bridge (Trajectory Logger)',
    ];
    return textBlock(lines.join('\n'));
}
const promptMap = {
    'hermes:skills-hub': skillsHubPrompt,
    'hermes:create-skill': createSkillPrompt,
    'hermes:optimize-skill': optimizeSkillPrompt,
    'hermes:memory-search': memorySearchPrompt,
    'hermes:compress-context': compressContextPrompt,
    'hermes:log-trajectory': logTrajectoryPrompt,
    'hermes:status': statusPrompt,
};
export const hermesCommandsMeta = [
    {
        name: 'hermes:skills-hub',
        description: 'Browse and install skills from the Hermes Skills Hub.',
        argumentHint: '[search-query]',
        allowedTools: ['Bash', 'Read', 'Write', 'Edit'],
        userInvocable: true,
    },
    {
        name: 'hermes:create-skill',
        description: 'Auto-create a skill from the recent conversation.',
        allowedTools: ['Bash', 'Read', 'Write'],
        userInvocable: true,
    },
    {
        name: 'hermes:optimize-skill',
        description: 'Optimize an existing skill based on usage feedback.',
        argumentHint: '<skill-name>',
        allowedTools: ['Bash', 'Read', 'Write', 'Edit'],
        userInvocable: true,
    },
    {
        name: 'hermes:memory-search',
        description: 'Search the Hermes memory store for relevant sessions.',
        argumentHint: '<query>',
        allowedTools: ['Bash', 'Read'],
        userInvocable: true,
    },
    {
        name: 'hermes:compress-context',
        description: 'Compress the current conversation context intelligently.',
        allowedTools: ['Read'],
        userInvocable: true,
    },
    {
        name: 'hermes:log-trajectory',
        description: 'Manually log the current conversation trajectory.',
        allowedTools: ['Bash', 'Read'],
        userInvocable: true,
    },
    {
        name: 'hermes:status',
        description: 'Show the current status of all Hermes self-learning modules.',
        allowedTools: ['Bash', 'Read'],
        userInvocable: true,
    },
];
export const hermesSkillDefinitions = hermesCommandsMeta.map(meta => ({
    name: meta.name,
    description: meta.description,
    aliases: meta.aliases,
    whenToUse: meta.whenToUse,
    argumentHint: meta.argumentHint,
    allowedTools: meta.allowedTools ?? [],
    model: meta.model,
    disableModelInvocation: meta.disableModelInvocation ?? false,
    userInvocable: meta.userInvocable ?? true,
    getPromptForCommand: (args, context) => {
        const fn = promptMap[meta.name];
        if (!fn) {
            return Promise.resolve(textBlock(`Unknown Hermes command: ${meta.name}`));
        }
        return fn(args, context);
    },
}));
export function registerHermesPlugin(registerSkill) {
    for (const cmd of hermesCommandsMeta) {
        registerSkill(cmd);
    }
}
export * from './types.js';
export * from './modules/index.js';
