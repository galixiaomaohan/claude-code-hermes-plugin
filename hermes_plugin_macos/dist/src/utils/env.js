import { homedir } from 'os';
import { join } from 'path';
export function getClaudeConfigHomeDir() {
    return (process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')).normalize('NFC');
}
export function getXdgDataHome() {
    if (process.env.XDG_DATA_HOME) {
        return process.env.XDG_DATA_HOME;
    }
    return join(homedir(), '.local', 'share');
}
export function getXdgConfigHome() {
    if (process.env.XDG_CONFIG_HOME) {
        return process.env.XDG_CONFIG_HOME;
    }
    return join(homedir(), '.config');
}
export function getXdgCacheHome() {
    if (process.env.XDG_CACHE_HOME) {
        return process.env.XDG_CACHE_HOME;
    }
    return join(homedir(), '.cache');
}
export function isEnvTruthy(value) {
    if (!value)
        return false;
    if (typeof value === 'boolean')
        return value;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase().trim());
}
export function isEnvDefinedFalsy(value) {
    if (value === undefined)
        return false;
    if (typeof value === 'boolean')
        return !value;
    if (!value)
        return false;
    return ['0', 'false', 'no', 'off'].includes(value.toLowerCase().trim());
}
