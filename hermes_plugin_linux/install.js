#!/usr/bin/env node
/**
 * Hermes Plugin Official Installer for Claude Code
 *
 * Uses the official Claude Code local marketplace installation flow.
 * Cross-platform: Linux, macOS, Windows.
 *
 * Security-hardened version:
 * - No shell: true on Windows (uses explicit cmd path)
 * - Atomic install with rollback on failure
 * - Path-traversal validation for all target paths
 * - File permission preservation and tightening (600/700)
 * - Package manager installs with --ignore-scripts, then manual rebuild for native deps
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
import { join, dirname, resolve, normalize } from 'path'
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

function getWindowsCmdPath(baseName) {
  // Resolve .cmd / .exe / .ps1 explicitly to avoid shell: true
  const { PATHEXT } = process.env
  const exts = PATHEXT ? PATHEXT.split(';') : ['.exe', '.cmd', '.bat', '.com', '.ps1']
  // Also ensure .ps1 is checked for PowerShell-based package managers
  if (!exts.some(e => e.toLowerCase() === '.ps1')) {
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

function safeSpawn(cmd, args, options = {}) {
  if (isWindows()) {
    const resolved = getWindowsCmdPath(cmd)
    if (resolved) {
      return spawnSync(resolved, args, { ...options, shell: false })
    }
    // Fallback: try direct spawn with shell false (works for .exe)
    return spawnSync(cmd, args, { ...options, shell: false })
  }
  return spawnSync(cmd, args, { ...options, shell: false })
}

function detectPackageManager() {
  const candidates = [
    { name: 'bun', args: ['install', '--ignore-scripts'] },
    { name: 'npm', args: ['install', '--legacy-peer-deps', '--ignore-scripts'] },
    { name: 'pnpm', args: ['install', '--ignore-scripts'] },
    { name: 'yarn', args: ['install', '--ignore-scripts'] },
  ]
  for (const pm of candidates) {
    const result = safeSpawn(pm.name, ['--version'], { encoding: 'utf-8' })
    if (!result.error && result.status === 0) {
      return pm
    }
  }
  return null
}

function detectClaudeCli() {
  const candidates = isWindows() ? ['claude.cmd', 'claude.exe', 'claude'] : ['claude']
  for (const cmd of candidates) {
    const result = safeSpawn(cmd, ['--version'], { encoding: 'utf-8' })
    if (!result.error && result.status === 0) {
      return cmd
    }
  }
  return null
}

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

  // Create marketplace manifest so the local marketplace is discoverable by the Claude CLI
  const marketplaceManifestPath = join(LOCAL_PLUGINS_DIR, '.claude-plugin', 'marketplace.json')
  const marketplaceManifest = {
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
        // Remove group/other permissions, keep owner read/write
        const mode = stat.mode & 0o777
        const safeMode = mode & 0o600
        chmodSync(dstPath, safeMode || 0o600)
      }
    }
  }
}

function rebuildNativeModules(cwd) {
  // After --ignore-scripts, manually trigger rebuild for better-sqlite3 if needed
  console.log('Rebuilding native modules (better-sqlite3)...')
  const result = safeSpawn('npm', ['rebuild', 'better-sqlite3'], {
    stdio: 'inherit',
    cwd,
  })
  if (result.error || result.status !== 0) {
    console.warn('Native module rebuild returned non-zero, but installation may still work if prebuilt binaries are present.')
  }
}

function installDependencies(cwd, pm) {
  console.log(`Installing dependencies with ${pm.name} (ignoring scripts for security)...`)
  const result = safeSpawn(pm.name, pm.args, {
    stdio: 'inherit',
    cwd,
  })
  if (result.error || result.status !== 0) {
    console.error(`\nFailed to install dependencies using ${pm.name}.`)
    process.exit(1)
  }
  rebuildNativeModules(cwd)
}

function rollback(tempDir) {
  console.log('Rolling back installation...')
  try {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
    if (existsSync(PLUGIN_TARGET)) {
      rmSync(PLUGIN_TARGET, { recursive: true, force: true })
    }
  } catch (e) {
    console.error('Rollback encountered an error:', e instanceof Error ? e.message : String(e))
  }
}

function main() {
  console.log('=== Hermes Plugin Installer for Claude Code ===\n')

  const cwd = resolve(process.cwd())
  validateTargetPath()

  // Ensure dependencies are installed in source
  if (!existsSync(join(cwd, 'node_modules'))) {
    const pm = detectPackageManager()
    if (!pm) {
      console.error('No supported package manager found (bun, npm, pnpm, yarn).')
      console.error('Please install Node.js and npm, then try again.')
      process.exit(1)
    }
    installDependencies(cwd, pm)
  }

  const claudeCli = detectClaudeCli()
  if (!claudeCli) {
    console.log('Claude CLI not found in PATH.\n')
    console.log('Please ensure Claude Code is installed and "claude" is in your PATH.')
    process.exit(1)
  }

  // Step 1: Ensure local marketplace is registered
  ensureLocalMarketplace()

  // Step 2: Atomic copy to temporary location inside LOCAL_PLUGINS_DIR then rename
  // Placing tempDir inside LOCAL_PLUGINS_DIR guarantees renameSync is atomic (same filesystem).
  const tempId = `hermes-plugin-install-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const tempDir = join(LOCAL_PLUGINS_DIR, tempId)
  console.log(`Preparing atomic installation to temporary directory...`)
  try {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
    recursiveCopySync(cwd, tempDir)
    console.log('Plugin copied to temporary directory.')
  } catch (e) {
    console.error('Failed to copy plugin to temporary directory:', e instanceof Error ? e.message : String(e))
    rollback(tempDir)
    process.exit(1)
  }

  // Step 3: Install dependencies in temp directory
  const pm = detectPackageManager()
  if (pm) {
    try {
      installDependencies(tempDir, pm)
    } catch {
      rollback(tempDir)
      process.exit(1)
    }
  }

  // Step 4: Atomically swap temp dir to target
  console.log(`Moving plugin to local marketplace: ${PLUGIN_TARGET}`)
  try {
    if (existsSync(PLUGIN_TARGET)) {
      rmSync(PLUGIN_TARGET, { recursive: true, force: true })
    }
    renameSync(tempDir, PLUGIN_TARGET)
    console.log('Plugin moved to local marketplace.\n')
  } catch (e) {
    console.error('Failed to move plugin to target directory:', e instanceof Error ? e.message : String(e))
    rollback(tempDir)
    process.exit(1)
  }

  // Step 5: Build TypeScript sources to JavaScript so Node.js can execute them
  console.log('Building TypeScript sources...')
  const buildResult = safeSpawn('npm', ['run', 'build'], {
    stdio: 'inherit',
    cwd: PLUGIN_TARGET,
  })
  if (buildResult.error || buildResult.status !== 0) {
    console.error('\nTypeScript build failed.')
    rollback(null)
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

  // Step 6: Install via official CLI from the local marketplace
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
