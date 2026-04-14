#!/usr/bin/env node
/**
 * Hermes Plugin Official Installer for Claude Code
 *
 * Uses the official Claude Code local marketplace installation flow.
 * Cross-platform: Linux, macOS, Windows.
 *
 * Security-hardened & robust version:
 * - Solves Windows Node.js CVE-2024-27980 (spawnSync .cmd/bat EINVAL)
 *   by resolving .cmd wrappers to their underlying node scripts.
 * - Build happens inside temp directory; atomic rename only after success.
 * - Retry logic for Windows directory-occupied EPERM.
 * - Path-traversal validation for all target paths.
 * - File permission preservation and tightening (600/700).
 * - Package manager installs with --ignore-scripts, then manual rebuild for native deps.
 */

import { spawnSync } from 'child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  rmSync,
  chmodSync,
  renameSync,
  realpathSync,
} from 'fs'
import { join, dirname, resolve, normalize, extname } from 'path'
import { homedir, platform } from 'os'

function getClaudeConfigHomeDir() {
  return (process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')).normalize('NFC')
}

const LOCAL_PLUGINS_DIR = join(getClaudeConfigHomeDir(), 'plugins')
const KNOWN_MARKETPLACES = join(LOCAL_PLUGINS_DIR, 'known_marketplaces.json')
const PLUGIN_NAME = 'hermes-plugin'
const PLUGIN_TARGET = join(LOCAL_PLUGINS_DIR, PLUGIN_NAME)

const SKIP_DIRS = new Set(['node_modules', '.git', '.claude'])

function isWindows() {
  return platform() === 'win32'
}

/* -------------------------------------------------------------------------- */
/*  Windows spawn helper – avoids EINVAL when spawning .cmd/.bat files        */
/* -------------------------------------------------------------------------- */

function getWindowsCmdPath(baseName) {
  const { PATHEXT } = process.env
  const exts = PATHEXT ? PATHEXT.split(';') : ['.exe', '.cmd', '.bat', '.com', '.ps1']
  if (!exts.some((e) => e.toLowerCase() === '.ps1')) {
    exts.push('.ps1')
  }
  const paths = (process.env.PATH || '').split(';')
  for (const dir of paths) {
    if (!dir) continue
    const noExt = join(dir, baseName)
    for (const ext of exts) {
      const full = noExt + ext.toLowerCase()
      if (existsSync(full)) {
        return full
      }
    }
  }
  return null
}

function findExeInPath(baseName) {
  const paths = (process.env.PATH || '').split(';')
  for (const dir of paths) {
    if (!dir) continue
    const full = join(dir, baseName + '.exe')
    if (existsSync(full)) return full
  }
  return null
}

/**
 * Resolve an executable name to a concrete path or a {cmd, args} object.
 * On Windows, .cmd/.bat wrappers are resolved to their underlying Node.js
 * scripts so we can spawn them with shell:false without hitting EINVAL.
 */
function resolveExecutable(name, cwd) {
  if (!isWindows()) return name

  // 1. Local cwd lookup for development tools (tsc, tsserver, etc.)
  if (cwd && !extname(name)) {
    if (name === 'tsc' || name === 'tsserver') {
      const binPath = join(cwd, 'node_modules', 'typescript', 'bin', name)
      if (existsSync(binPath)) {
        return { cmd: process.execPath, args: [binPath] }
      }
    }
    const localCmd = join(cwd, 'node_modules', '.bin', name + '.cmd')
    if (existsSync(localCmd)) {
      try {
        const content = readFileSync(localCmd, 'utf-8')
        const match = content.match(
          /(?:^|\s)node(?:\.exe)?\s+["']?((?:%~dp0|[A-Za-z]:\\|\\\\|\\)[^"'\s]+)/i,
        )
        if (match) {
          let scriptPath = match[1].replace(/%~dp0/gi, dirname(localCmd) + '\\')
          scriptPath = resolve(dirname(localCmd), scriptPath)
          if (existsSync(scriptPath)) {
            return { cmd: process.execPath, args: [scriptPath] }
          }
        }
      } catch {}
    }
  }

  // 2. Direct .exe lookup (highest priority for claude, bun, etc.)
  if (!extname(name)) {
    const exePath = findExeInPath(name)
    if (exePath && existsSync(exePath)) return exePath
  }

  const cmdPath = getWindowsCmdPath(name)
  if (!cmdPath) return name

  const ext = extname(cmdPath).toLowerCase()
  if (ext !== '.cmd' && ext !== '.bat') return cmdPath

  // 3. npm / npx -> node …/npm-cli.js
  if (name === 'npm' || name === 'npx') {
    const cliJs = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', `${name}-cli.js`)
    if (existsSync(cliJs)) {
      return { cmd: process.execPath, args: [cliJs] }
    }
  }

  // 4. Generic .cmd parser: look for node[.exe] "<script-path>"
  try {
    const content = readFileSync(cmdPath, 'utf-8')
    const match = content.match(
      /(?:^|\s)node(?:\.exe)?\s+["']?((?:%~dp0|[A-Za-z]:\\|\\\\|\\)[^"'\s]+)/i,
    )
    if (match) {
      let scriptPath = match[1].replace(/%~dp0/gi, dirname(cmdPath) + '\\')
      scriptPath = resolve(dirname(cmdPath), scriptPath)
      if (existsSync(scriptPath)) {
        return { cmd: process.execPath, args: [scriptPath] }
      }
    }
  } catch {}

  // 5. Fallback for claude: prefer .exe if we missed it above
  if (name === 'claude') {
    const directExe = findExeInPath('claude')
    if (directExe) return directExe
  }

  return cmdPath
}

function safeSpawn(cmd, args, options = {}) {
  const resolved = resolveExecutable(cmd, options.cwd)
  if (typeof resolved === 'string') {
    return spawnSync(resolved, args, { ...options, shell: false })
  }
  if (resolved && resolved.cmd) {
    return spawnSync(resolved.cmd, [...resolved.args, ...args], { ...options, shell: false })
  }
  return spawnSync(cmd, args, { ...options, shell: false })
}

/* -------------------------------------------------------------------------- */
/*  Package manager & Claude CLI detection                                    */
/* -------------------------------------------------------------------------- */

function detectPackageManager() {
  const candidates = [
    { name: 'bun', args: ['install', '--ignore-scripts'] },
    { name: 'npm', args: ['install', '--legacy-peer-deps', '--ignore-scripts'] },
    { name: 'pnpm', args: ['install', '--ignore-scripts'] },
    { name: 'yarn', args: ['install', '--ignore-scripts'] },
  ]
  for (const pm of candidates) {
    const resolved = resolveExecutable(pm.name)
    let testCmd, testArgs
    if (typeof resolved === 'string') {
      testCmd = resolved
      testArgs = ['--version']
    } else if (resolved && resolved.cmd) {
      testCmd = resolved.cmd
      testArgs = [...resolved.args, '--version']
    } else {
      testCmd = pm.name
      testArgs = ['--version']
    }
    const result = safeSpawn(testCmd, testArgs, { encoding: 'utf-8' })
    if (!result.error && result.status === 0) {
      return { ...pm, resolved }
    }
  }
  return null
}

function detectClaudeCli() {
  if (isWindows()) {
    // Prefer direct claude.exe to avoid .cmd wrappers entirely
    const exePath = findExeInPath('claude')
    if (exePath) {
      const r = spawnSync(exePath, ['--version'], { encoding: 'utf-8', shell: false })
      if (!r.error && r.status === 0) return exePath
    }
    const resolved = resolveExecutable('claude')
    if (resolved) {
      let cmd, args
      if (typeof resolved === 'string') {
        cmd = resolved
        args = ['--version']
      } else {
        cmd = resolved.cmd
        args = [...resolved.args, '--version']
      }
      const r = spawnSync(cmd, args, { encoding: 'utf-8', shell: false })
      if (!r.error && r.status === 0) return cmd
    }
    return null
  }
  const r = spawnSync('claude', ['--version'], { encoding: 'utf-8', shell: false })
  if (!r.error && r.status === 0) return 'claude'
  return null
}

/* -------------------------------------------------------------------------- */
/*  JSON helpers                                                              */
/* -------------------------------------------------------------------------- */

function readJson(path) {
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return {}
  }
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
}

function ensureLocalMarketplace() {
  const known = readJson(KNOWN_MARKETPLACES)
  if (!known.local) {
    known.local = {
      source: {
        source: 'directory',
        path: LOCAL_PLUGINS_DIR,
      },
      installLocation: LOCAL_PLUGINS_DIR,
      lastUpdated: new Date().toISOString(),
    }
    writeJson(KNOWN_MARKETPLACES, known)
    console.log('Registered local marketplace in known_marketplaces.json.')
  }

  const marketplaceManifestPath = join(LOCAL_PLUGINS_DIR, '.claude-plugin', 'marketplace.json')
  const marketplaceManifest = {
    $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
    name: 'local',
    description: 'Local plugin marketplace',
    owner: {
      name: 'Local User',
    },
    plugins: [
      {
        name: PLUGIN_NAME,
        description: 'Hermes self-learning plugin for Claude Code',
        source: `./${PLUGIN_NAME}`,
      },
    ],
  }
  writeJson(marketplaceManifestPath, marketplaceManifest)
  console.log('Ensured local marketplace manifest exists.')
}

/* -------------------------------------------------------------------------- */
/*  Path security & file operations                                           */
/* -------------------------------------------------------------------------- */

function isInsideDirectory(child, parent) {
  let resolvedChild
  let resolvedParent
  try {
    resolvedChild = resolve(realpathSync(child))
  } catch {
    resolvedChild = resolve(child)
  }
  try {
    resolvedParent = resolve(realpathSync(parent))
  } catch {
    resolvedParent = resolve(parent)
  }
  const relative = normalize(resolvedChild).replace(/\\/g, '/')
  const base = normalize(resolvedParent).replace(/\\/g, '/')
  return relative === base || relative.startsWith(base + '/')
}

function validateTargetPath() {
  mkdirSync(LOCAL_PLUGINS_DIR, { recursive: true, mode: 0o700 })
  if (!isInsideDirectory(PLUGIN_TARGET, LOCAL_PLUGINS_DIR)) {
    console.error('Security validation failed: PLUGIN_TARGET path traversal detected.')
    console.error(`Target: ${PLUGIN_TARGET}`)
    console.error(`Expected base: ${LOCAL_PLUGINS_DIR}`)
    process.exit(1)
  }
}

function recursiveCopySync(src, dst) {
  mkdirSync(dst, { recursive: true, mode: 0o700 })
  for (const entry of readdirSync(src)) {
    if (SKIP_DIRS.has(entry)) continue
    const srcPath = join(src, entry)
    const dstPath = join(dst, entry)
    const stat = statSync(srcPath)
    if (stat.isDirectory()) {
      recursiveCopySync(srcPath, dstPath)
    } else {
      copyFileSync(srcPath, dstPath)
      if (!isWindows()) {
        const mode = stat.mode & 0o777
        const safeMode = mode & 0o600
        chmodSync(dstPath, safeMode || 0o600)
      }
    }
  }
}

function removeWithRetry(dir) {
  for (let i = 0; i < 3; i++) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch (e) {
      if (i === 2) throw e
      const start = Date.now()
      while (Date.now() - start < 200) {}
    }
  }
}

function renameWithRetry(oldPath, newPath) {
  for (let i = 0; i < 3; i++) {
    try {
      renameSync(oldPath, newPath)
      return
    } catch (e) {
      if (i === 2) throw e
      const start = Date.now()
      while (Date.now() - start < 200) {}
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Dependency & build helpers                                                */
/* -------------------------------------------------------------------------- */

function rebuildNativeModules(cwd) {
  console.log('Rebuilding native modules (better-sqlite3)...')
  const npmResolved = resolveExecutable('npm')
  let cmd, args
  if (typeof npmResolved === 'string') {
    cmd = npmResolved
    args = ['rebuild', 'better-sqlite3']
  } else if (npmResolved && npmResolved.cmd) {
    cmd = npmResolved.cmd
    args = [...npmResolved.args, 'rebuild', 'better-sqlite3']
  } else {
    cmd = 'npm'
    args = ['rebuild', 'better-sqlite3']
  }
  const result = safeSpawn(cmd, args, { stdio: 'inherit', cwd })
  if (result.error || result.status !== 0) {
    console.warn(
      'Native module rebuild returned non-zero, but installation may still work if prebuilt binaries are present.',
    )
  }
}

function installDependencies(cwd, pm) {
  console.log(`Installing dependencies with ${pm.name} (ignoring scripts for security)...`)
  let cmd, args
  if (typeof pm.resolved === 'string') {
    cmd = pm.resolved
    args = pm.args
  } else if (pm.resolved && pm.resolved.cmd) {
    cmd = pm.resolved.cmd
    args = [...pm.resolved.args, ...pm.args]
  } else {
    cmd = pm.name
    args = pm.args
  }
  const result = safeSpawn(cmd, args, { stdio: 'inherit', cwd })
  if (result.error || result.status !== 0) {
    console.error(`\nFailed to install dependencies using ${pm.name}.`)
    process.exit(1)
  }
  rebuildNativeModules(cwd)
}

function buildInDir(cwd) {
  console.log('Building TypeScript sources...')
  // Directly invoke the TypeScript compiler via node to avoid PATH/PATHEXT issues
  // and the Windows Node.js CVE-2024-27980 EINVAL bug with .cmd wrappers.
  const tscBin = join(cwd, 'node_modules', 'typescript', 'bin', 'tsc')
  if (!existsSync(tscBin)) {
    console.error('TypeScript compiler not found at', tscBin)
    return false
  }
  const result = spawnSync(process.execPath, [tscBin], { stdio: 'inherit', cwd, shell: false })
  if (result.error || result.status !== 0) {
    console.error('\nTypeScript build failed.')
    return false
  }
  return true
}

function rollback(tempDir) {
  console.log('Rolling back installation...')
  try {
    if (tempDir && existsSync(tempDir)) {
      removeWithRetry(tempDir)
    }
    if (existsSync(PLUGIN_TARGET)) {
      removeWithRetry(PLUGIN_TARGET)
    }
  } catch (e) {
    console.error('Rollback encountered an error:', e instanceof Error ? e.message : String(e))
  }
}

/* -------------------------------------------------------------------------- */
/*  Main installer                                                            */
/* -------------------------------------------------------------------------- */

function main() {
  console.log('=== Hermes Plugin Installer for Claude Code ===\n')

  const cwd = resolve(process.cwd())
  validateTargetPath()

  const pm = detectPackageManager()
  if (!pm) {
    console.error('No supported package manager found (bun, npm, pnpm, yarn).')
    console.error('Please install Node.js and npm, then try again.')
    process.exit(1)
  }

  const claudeCli = detectClaudeCli()
  if (!claudeCli) {
    console.log('Claude CLI not found in PATH.\n')
    console.log('Please ensure Claude Code is installed and "claude" is in your PATH.')
    process.exit(1)
  }

  // Step 1: Ensure local marketplace is registered
  ensureLocalMarketplace()

  // Step 2: Atomic copy to temporary location inside LOCAL_PLUGINS_DIR
  const tempId = `hermes-plugin-install-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const tempDir = join(LOCAL_PLUGINS_DIR, tempId)
  console.log(`Preparing atomic installation to temporary directory...`)
  try {
    if (existsSync(tempDir)) {
      removeWithRetry(tempDir)
    }
    recursiveCopySync(cwd, tempDir)
    console.log('Plugin copied to temporary directory.')
  } catch (e) {
    console.error('Failed to copy plugin to temporary directory:', e instanceof Error ? e.message : String(e))
    rollback(tempDir)
    process.exit(1)
  }

  // Step 3: Install dependencies in temp directory
  try {
    installDependencies(tempDir, pm)
  } catch {
    rollback(tempDir)
    process.exit(1)
  }

  // Step 4: Build inside temp directory BEFORE moving to target
  const buildOk = buildInDir(tempDir)
  if (!buildOk) {
    rollback(tempDir)
    process.exit(1)
  }

  // Step 5: Atomically swap temp dir to target
  console.log(`Moving plugin to local marketplace: ${PLUGIN_TARGET}`)
  try {
    if (existsSync(PLUGIN_TARGET)) {
      removeWithRetry(PLUGIN_TARGET)
    }
    renameWithRetry(tempDir, PLUGIN_TARGET)
    console.log('Plugin moved to local marketplace.\n')
  } catch (e) {
    console.error('Failed to move plugin to target directory:', e instanceof Error ? e.message : String(e))
    rollback(tempDir)
    process.exit(1)
  }

  // Step 6: Update local marketplace so the CLI can discover the plugin
  console.log('Updating local marketplace index...')
  const updateResult = safeSpawn(claudeCli, ['plugin', 'marketplace', 'update', 'local'], {
    stdio: 'inherit',
  })
  if (updateResult.error || updateResult.status !== 0) {
    console.warn('\nMarketplace update returned non-zero, attempting install anyway...')
  }

  // Step 7: Install via official CLI from the local marketplace
  console.log('Installing hermes-plugin using the official Claude Code CLI...\n')
  const result = safeSpawn(claudeCli, ['plugin', 'install', `${PLUGIN_NAME}@local`, '-s', 'user'], {
    stdio: 'inherit',
  })
  if (result.error || result.status !== 0) {
    console.error('\nInstallation via Claude CLI failed.')
    rollback(null)
    console.log('You can try installing manually by running:')
    console.log(`  ${claudeCli} plugin install ${PLUGIN_NAME}@local -s user`)
    process.exit(1)
  }

  console.log('\nInstallation complete!')
  console.log('Restart Claude Code if it is already running.')
  console.log('After restart, run /status to verify hermes-plugin is working.')
}

main()
