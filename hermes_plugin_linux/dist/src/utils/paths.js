import { join } from 'path';
import { getClaudeConfigHomeDir, getXdgDataHome } from './env.js';
export function getHermesPluginDataDir() {
    // Prefer XDG_DATA_HOME for user data isolation and cross-platform consistency.
    // If CLAUDE_CONFIG_DIR is explicitly overridden, keep data near config for compatibility.
    if (process.env.CLAUDE_CONFIG_DIR) {
        return join(getClaudeConfigHomeDir(), 'plugins', 'data', 'hermes-plugin');
    }
    return join(getXdgDataHome(), 'hermes-plugin');
}
