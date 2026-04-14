export function getCwd() {
    try {
        return process.cwd();
    }
    catch {
        return process.cwd();
    }
}
export function pwd() {
    return getCwd();
}
