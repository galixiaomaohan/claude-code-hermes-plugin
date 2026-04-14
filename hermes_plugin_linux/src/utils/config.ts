import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getClaudeConfigHomeDir } from './env.js'

export type GlobalConfig = {
  hermesMemoryProvider?: 'built-in' | 'honcho' | 'mem0' | 'local-vector'
  hermesSkillsAutoCreate?: boolean
  hermesSkillsHubUrl?: string
  hermesTrainingTrajectoryDir?: string
}

function loadSettings(): Record<string, unknown> {
  try {
    const settingsPath = join(getClaudeConfigHomeDir(), 'settings.json')
    if (!existsSync(settingsPath)) return {}
    const content = readFileSync(settingsPath, 'utf-8')
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function getGlobalConfig(): GlobalConfig {
  const settings = loadSettings()
  return {
    hermesMemoryProvider: settings.hermesMemoryProvider as GlobalConfig['hermesMemoryProvider'],
    hermesSkillsAutoCreate: settings.hermesSkillsAutoCreate as boolean | undefined,
    hermesSkillsHubUrl: settings.hermesSkillsHubUrl as string | undefined,
    hermesTrainingTrajectoryDir: settings.hermesTrainingTrajectoryDir as string | undefined,
  }
}
