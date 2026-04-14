#!/usr/bin/env node
/**
 * Hermes Plugin Official Uninstaller for Claude Code
 *
 * Uses the official Claude Code plugin uninstallation flow.
 * Cross-platform: Linux, macOS, Windows.
 *
 * Security-hardened version:
 * - No shell: true on Windows
 * - Removes plugin registration, plugin directory, and data directory
 * - Path-traversal validation before any deletion
 */

import { spawnSync } from 'child_process'
import { existsSync, rmSync, realpathSync } from 'fs'
import { join, resolve, normalize, dirname } from 'path'
import { homedir, platform, tmpdir } from 'os'

function getClaudeConfigHomeDir() {
  return (process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')).normalize('NFC')
}

const LOCAL_PLUGINS_DIR = join(getClaudeConfigHomeDir(), 'plugins')
const PLUGIN_NAME = 'hermes-plugin'
const PLUGIN_TARGET = join(LOCAL_PLUGINS_DIR, PLUGIN_NAME)

function getXdgDataHome() {
  if (process.env.XDG_DATA_HOME) {
    return process.env.XDG_DATA_HOME
  }
  return join(homedir(), '.local', 'share')
}

function getHermesPluginDataDir() {
  // Must match src/utils/paths.ts exactly
  if (process.env.CLAUDE_CONFIG_DIR) {
    return join(getClaudeConfigHomeDir(), 'plugins', 'data', PLUGIN_NAME)
  }
  return join(getXdgDataHome(), PLUGIN_NAME)
}

const PLUGIN_DATA_DIR = getHermesPluginDataDir()

function isWindows() {
  return platform() === 'win32'
}

function getWindowsCmdPath(baseName) {
  const { PATHEXT } = process.env
  const exts = PATHEXT ? PATHEXT.split(';') : ['.exe', '.cmd', '.bat', '.com', '.ps1']
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
    return spawnSync(cmd, args, { ...options, shell: false })
  }
  return spawnSync(cmd, args, { ...options, shell: false })
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

function main() {
  console.log('=== Hermes Plugin Uninstaller for Claude Code ===\n')

  validatePaths()

  const claudeCli = detectClaudeCli()
  if (claudeCli) {
    console.log('Uninstalling hermes-plugin using the official Claude Code CLI...\n')
    const result = safeSpawn(claudeCli, ['plugin', 'uninstall', 'hermes-plugin@local'], {
      stdio: 'inherit',
    })
    if (result.error || result.status !== 0) {
      console.error('\nUninstallation via Claude CLI failed.')
      console.log('You can uninstall manually by running:')
      console.log(`  ${claudeCli} plugin uninstall hermes-plugin@local`)
      process.exit(1)
    }
    console.log('\nCLI unregistration complete!')
  } else {
    console.log('Claude CLI not found in PATH.\n')
    console.log('Please uninstall the plugin manually by running:')
    console.log('  claude plugin uninstall hermes-plugin@local')
  }

  // Clean up plugin directory and data directory
  console.log('\nCleaning up plugin files and data...')
  safeRemove(PLUGIN_TARGET, LOCAL_PLUGINS_DIR)
  safeRemove(PLUGIN_DATA_DIR, dirname(PLUGIN_DATA_DIR))

  console.log('\nUninstallation complete!')
  console.log('After uninstallation, restart Claude Code.')
}

main()
