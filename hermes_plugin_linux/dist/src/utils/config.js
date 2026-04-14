import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getClaudeConfigHomeDir } from './env.js';
function loadSettings() {
    try {
        const settingsPath = join(getClaudeConfigHomeDir(), 'settings.json');
        if (!existsSync(settingsPath))
            return {};
        const content = readFileSync(settingsPath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return {};
    }
}
export function getGlobalConfig() {
    const settings = loadSettings();
    return {
        hermesMemoryProvider: settings.hermesMemoryProvider,
        hermesSkillsAutoCreate: settings.hermesSkillsAutoCreate,
        hermesSkillsHubUrl: settings.hermesSkillsHubUrl,
        hermesTrainingTrajectoryDir: settings.hermesTrainingTrajectoryDir,
    };
}
