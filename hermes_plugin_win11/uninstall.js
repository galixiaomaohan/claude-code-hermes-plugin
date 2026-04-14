#!/usr/bin/env node
/**
 * Hermes Plugin Official Uninstaller for Claude Code
 *
 * Uses the official Claude Code plugin uninstallation flow.
 * Cross-platform: Linux, macOS, Windows.
 *
 * Security-hardened & robust version:
 * - Solves Windows Node.js CVE-2024-27980 (spawnSync .cmd/bat EINVAL)
 *   by resolving .cmd wrappers to their underlying node scripts.
 * - Graceful fallback uninstallation (@local suffix, then bare name, then manual cleanup)
 * - Cleans up local marketplace registration when empty.
 * - Path-traversal validation before any deletion.
 * - Retry logic for Windows directory-occupied EPERM.
 */

import { spawnSync } from 'child_process'
import { existsSync, rmSync, realpathSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve, normalize, dirname, extname } from 'path'
import { homedir, platform } from 'os'

function getClaudeConfigHomeDir() {
  return (process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')).normalize('NFC')
}

const LOCAL_PLUGINS_DIR = join(getClaudeConfigHomeDir(), 'plugins')
const KNOWN_MARKETPLACES = join(LOCAL_PLUGINS_DIR, 'known_marketplaces.json')
const PLUGIN_NAME = 'hermes-plugin'
const PLUGIN_TARGET = join(LOCAL_PLUGINS_DIR, PLUGIN_NAME)

function getXdgDataHome() {
  if (process.env.XDG_DATA_HOME) {
    return process.env.XDG_DATA_HOME
  }
  return join(homedir(), '.local', 'share')
}

function getHermesPluginDataDir() {
  if (process.env.CLAUDE_CONFIG_DIR) {
    return join(getClaudeConfigHomeDir(), 'plugins', 'data', PLUGIN_NAME)
  }
  return join(getXdgDataHome(), PLUGIN_NAME)
}

const PLUGIN_DATA_DIR = getHermesPluginDataDir()

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

function resolveExecutable(name) {
  if (!isWindows()) return name

  if (!extname(name)) {
    const exePath = findExeInPath(name)
    if (exePath && existsSync(exePath)) return exePath
  }

  const cmdPath = getWindowsCmdPath(name)
  if (!cmdPath) return name

  const ext = extname(cmdPath).toLowerCase()
  if (ext !== '.cmd' && ext !== '.bat') return cmdPath

  if (name === 'npm' || name === 'npx') {
    const cliJs = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', `${name}-cli.js`)
    if (existsSync(cliJs)) {
      return { cmd: process.execPath, args: [cliJs] }
    }
  }

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

  if (name === 'claude') {
    const directExe = findExeInPath('claude')
    if (directExe) return directExe
  }

  return cmdPath
}

function safeSpawn(cmd, args, options = {}) {
  const resolved = resolveExecutable(cmd)
  if (typeof resolved === 'string') {
    return spawnSync(resolved, args, { ...options, shell: false })
  }
  if (resolved && resolved.cmd) {
    return spawnSync(resolved.cmd, [...resolved.args, ...args], { ...options, shell: false })
  }
  return spawnSync(cmd, args, { ...options, shell: false })
}

function detectClaudeCli() {
  if (isWindows()) {
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
/*  Path security                                                             */
/* -------------------------------------------------------------------------- */

function isInsideDirectory(child, parent) {
  let resolvedChild
  let resolvedParent
  try {
    resolvedChild = resolve(realpathSync(child))
    resolvedParent = resolve(realpathSync(parent))
  } catch {
    resolvedChild = resolve(child)
    resolvedParent = resolve(parent)
  }
  const relative = normalize(resolvedChild).replace(/\\/g, '/')
  const base = normalize(resolvedParent).replace(/\\/g, '/')
  return relative === base || relative.startsWith(base + '/')
}

function validatePaths() {
  if (!isInsideDirectory(PLUGIN_TARGET, LOCAL_PLUGINS_DIR)) {
    console.error('Security validation failed: PLUGIN_TARGET path traversal detected.')
    process.exit(1)
  }
  const dataDirValid =
    isInsideDirectory(PLUGIN_DATA_DIR, LOCAL_PLUGINS_DIR) ||
    isInsideDirectory(PLUGIN_DATA_DIR, getXdgDataHome())
  if (!dataDirValid) {
    console.error('Security validation failed: PLUGIN_DATA_DIR path traversal detected.')
    process.exit(1)
  }
}

function safeRemove(dir, allowedParent) {
  if (!existsSync(dir)) return
  const parent = allowedParent || LOCAL_PLUGINS_DIR
  if (!isInsideDirectory(dir, parent)) {
    console.error(`Security check failed: refusing to remove ${dir} (outside expected directory).`)
    return
  }
  try {
    rmSync(dir, { recursive: true, force: true })
    console.log(`Removed: ${dir}`)
  } catch (e) {
    console.error(`Failed to remove ${dir}:`, e instanceof Error ? e.message : String(e))
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

function readJson(path) {
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return {}
  }
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
}

function cleanupLocalMarketplace() {
  try {
    const known = readJson(KNOWN_MARKETPLACES)
    if (!known.local) return

    // Check if any other plugins remain under the local marketplace
    let hasOtherPlugins = false
    try {
      const entries = require('fs').readdirSync(LOCAL_PLUGINS_DIR)
      for (const entry of entries) {
        const full = join(LOCAL_PLUGINS_DIR, entry)
        const st = require('fs').statSync(full)
        if (st.isDirectory() && entry !== 'marketplaces' && entry !== '.claude-plugin' && entry !== 'data') {
          hasOtherPlugins = true
          break
        }
      }
    } catch {}

    if (!hasOtherPlugins) {
      delete known.local
      writeJson(KNOWN_MARKETPLACES, known)
      console.log('Cleaned up local marketplace registration.')
    }
  } catch (e) {
    // Non-fatal
  }
}

/* -------------------------------------------------------------------------- */
/*  Main uninstaller                                                          */
/* -------------------------------------------------------------------------- */

function main() {
  console.log('=== Hermes Plugin Uninstaller for Claude Code ===\n')

  validatePaths()

  const claudeCli = detectClaudeCli()
  let uninstalledViaCli = false

  if (claudeCli) {
    // Attempt 1: uninstall without @local suffix
    console.log('Attempting uninstallation via Claude Code CLI (hermes-plugin)...')
    let result = safeSpawn(claudeCli, ['plugin', 'uninstall', 'hermes-plugin'], { stdio: 'inherit' })
    if (!result.error && result.status === 0) {
      uninstalledViaCli = true
    } else {
      // Attempt 2: uninstall with @local suffix
      console.log('Attempting uninstallation via Claude Code CLI (hermes-plugin@local)...')
      result = safeSpawn(claudeCli, ['plugin', 'uninstall', 'hermes-plugin@local'], { stdio: 'inherit' })
      if (!result.error && result.status === 0) {
        uninstalledViaCli = true
      } else {
        console.warn('\nUninstallation via Claude CLI failed; proceeding with manual cleanup...')
      }
    }
  } else {
    console.log('Claude CLI not found in PATH; proceeding with manual cleanup...\n')
  }

  if (uninstalledViaCli) {
    console.log('\nCLI unregistration complete!')
  }

  // Clean up plugin directory and data directory
  console.log('\nCleaning up plugin files and data...')
  try {
    if (existsSync(PLUGIN_TARGET)) {
      removeWithRetry(PLUGIN_TARGET)
    }
    console.log(`Removed: ${PLUGIN_TARGET}`)
  } catch (e) {
    console.error(`Failed to remove ${PLUGIN_TARGET}:`, e instanceof Error ? e.message : String(e))
  }
  safeRemove(PLUGIN_DATA_DIR, dirname(PLUGIN_DATA_DIR))

  cleanupLocalMarketplace()

  console.log('\nUninstallation complete!')
  console.log('After uninstallation, restart Claude Code.')
}

main()
