import { logForDebugging } from '../utils/debug.js'
import { getGlobalConfig } from '../utils/config.js'

export type HubSkill = {
  identifier: string
  name: string
  description: string
  version?: string
}

export class SkillHubClient {
  private baseUrl: string

  constructor(baseUrl = 'https://agentskills.io') {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs = 15000,
  ): Promise<Response> {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      return response
    } finally {
      clearTimeout(id)
    }
  }

  async search(query: string, limit = 10): Promise<HubSkill[]> {
    try {
      const resp = await this.fetchWithTimeout(
        `${this.baseUrl}/api/v1/skills/search?q=${encodeURIComponent(query)}&limit=${limit}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
        },
      )
      if (!resp.ok) {
        logForDebugging(`SkillHubClient.search HTTP ${resp.status}`)
        return []
      }
      const data = (await resp.json()) as { skills?: HubSkill[] }
      return data.skills ?? []
    } catch (e) {
      logForDebugging(`SkillHubClient.search failed: ${e instanceof Error ? e.message : String(e)}`)
      return []
    }
  }

  async listSkills(limit = 50): Promise<HubSkill[]> {
    try {
      const resp = await this.fetchWithTimeout(
        `${this.baseUrl}/api/v1/skills?limit=${limit}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
        },
      )
      if (!resp.ok) {
        logForDebugging(`SkillHubClient.listSkills HTTP ${resp.status}`)
        return []
      }
      const data = (await resp.json()) as { skills?: HubSkill[] }
      return data.skills ?? []
    } catch (e) {
      logForDebugging(`SkillHubClient.listSkills failed: ${e instanceof Error ? e.message : String(e)}`)
      return []
    }
  }

  async install(identifier: string, targetDir: string): Promise<string | null> {
    try {
      const resp = await this.fetchWithTimeout(
        `${this.baseUrl}/api/v1/skills/${encodeURIComponent(identifier)}/download`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
        },
      )
      if (!resp.ok) {
        logForDebugging(`SkillHubClient.install HTTP ${resp.status}`)
        return null
      }
      const data = (await resp.json()) as { content?: string; name?: string; sha256?: string }
      if (!data.content) {
        logForDebugging('SkillHubClient.install: missing content')
        return null
      }

      // Basic integrity check if server provides sha256
      if (data.sha256) {
        const crypto = await import('crypto')
        const hash = crypto.createHash('sha256').update(data.content, 'utf-8').digest('hex')
        if (hash !== data.sha256) {
          logForDebugging('SkillHubClient.install: SHA-256 mismatch, aborting install')
          return null
        }
      }

      // Content safety check: must look like a SKILL.md (contain frontmatter)
      if (!data.content.includes('---')) {
        logForDebugging('SkillHubClient.install: downloaded content missing frontmatter, aborting')
        return null
      }

      const { mkdir, writeFile } = await import('fs/promises')
      const { join } = await import('path')
      let skillName = (data.name || identifier).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '')
      if (!skillName || skillName === '.' || skillName === '..') {
        skillName = identifier.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '') || `hub-skill-${Date.now()}`
      }
      // Final safety check: skillName must not be empty after sanitization
      if (!skillName || skillName === '.' || skillName === '..') {
        skillName = `hub-skill-${Date.now()}`
      }
      const skillDir = join(targetDir, skillName)
      await mkdir(skillDir, { recursive: true, mode: 0o700 })
      const skillPath = join(skillDir, 'SKILL.md')
      await writeFile(skillPath, data.content, { mode: 0o600 })
      return skillPath
    } catch (e) {
      logForDebugging(`SkillHubClient.install failed: ${e instanceof Error ? e.message : String(e)}`)
      return null
    }
  }
}

export function getSkillHubClient(): SkillHubClient {
  const url = process.env.CLAUDE_HERMES_SKILLS_HUB_URL || getGlobalConfig().hermesSkillsHubUrl || 'https://agentskills.io'
  return new SkillHubClient(url)
}
