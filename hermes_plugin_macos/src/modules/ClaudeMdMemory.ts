import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getClaudeConfigHomeDir } from '../utils/env.js'
import { logForDebugging } from '../utils/debug.js'

export class ClaudeMdMemory {
  async getMemoryContext(): Promise<string | null> {
    try {
      const home = getClaudeConfigHomeDir()
      const candidates = ['CLAUDE.md', 'claude.md', 'Claude.md']
      for (const name of candidates) {
        const path = join(home, name)
        if (existsSync(path)) {
          return readFileSync(path, 'utf-8')
        }
      }
      return null
    } catch (e) {
      logForDebugging(`ClaudeMdMemory.getMemoryContext failed: ${e instanceof Error ? e.message : String(e)}`, { level: 'error' })
      return null
    }
  }
}
