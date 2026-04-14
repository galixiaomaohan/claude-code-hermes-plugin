const LEVEL_ORDER = {
    verbose: 0,
    debug: 1,
    info: 2,
    warn: 3,
    error: 4,
};
function getMinDebugLogLevel() {
    const raw = process.env.CLAUDE_CODE_DEBUG_LOG_LEVEL?.toLowerCase().trim();
    if (raw && Object.hasOwn(LEVEL_ORDER, raw)) {
        return raw;
    }
    return 'debug';
}
function isDebugMode() {
    return (isEnvTruthy(process.env.DEBUG) ||
        isEnvTruthy(process.env.DEBUG_SDK) ||
        process.argv.includes('--debug') ||
        process.argv.includes('-d'));
}
import { isEnvTruthy } from './env.js';
const MAX_LOG_LENGTH = 500;
function sanitizeLogMessage(message) {
    // Redact potential secrets and PII from logs
    let sanitized = message
        .replace(/\b[0-9a-f]{64}\b/gi, '[REDACTED_HEX64]')
        .replace(/\b[0-9a-f]{40}\b/gi, '[REDACTED_HEX40]')
        .replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '[REDACTED_BASE64]')
        .replace(/\b(?:sk|pk|api|token|key)[-_]?\w*[:=]\s*\S+/gi, '[REDACTED_CREDENTIAL]');
    if (sanitized.length > MAX_LOG_LENGTH) {
        sanitized = sanitized.slice(0, MAX_LOG_LENGTH) + '...[truncated]';
    }
    return sanitized;
}
export function logForDebugging(message, { level } = { level: 'debug' }) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[getMinDebugLogLevel()]) {
        return;
    }
    if (!isDebugMode()) {
        return;
    }
    const timestamp = new Date().toISOString();
    const safeMessage = sanitizeLogMessage(message);
    const output = `${timestamp} [${level.toUpperCase()}] ${safeMessage.trim()}\n`;
    process.stderr.write(output);
}
