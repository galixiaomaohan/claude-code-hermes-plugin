import { appendFile, mkdir, readFile, writeFile, readdir, stat, unlink } from 'fs/promises'
import { dirname, join } from 'path'
import { getHermesPluginDataDir } from '../utils/paths.js'
import { logForDebugging } from '../utils/debug.js'
import { getGlobalConfig } from '../utils/config.js'
import { sideQuery, type SideQueryFunction } from '../utils/sideQuery.js'

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const DEFAULT_RETENTION_DAYS = 90

export type TrajectoryEntry = {
  timestamp: number
  session_id: string
  model: string
  messages: unknown[]
  tool_calls: unknown[]
  final_response: string
}

export type TrajectoryAnalysis = {
  patterns: string[]
  suggestedSkillName: string
  suggestedSkillMarkdown: string
}

function getTrajectoryDir(): string {
  const configDir = getGlobalConfig().hermesTrainingTrajectoryDir
  if (configDir) return configDir
  return join(getHermesPluginDataDir(), 'trajectories')
}

function getRetentionDays(): number {
  const env = process.env.HERMES_DATA_RETENTION_DAYS
  if (env) {
    const parsed = parseInt(env, 10)
    if (!isNaN(parsed) && parsed >= 0) return parsed
  }
  return DEFAULT_RETENTION_DAYS
}

async function pruneOldFiles(dir: string, extension: string, retentionDays: number): Promise<void> {
  if (retentionDays <= 0) return
  try {
    const entries = await readdir(dir)
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    for (const entry of entries) {
      if (!entry.endsWith(extension)) continue
      const filePath = join(dir, entry)
      try {
        const s = await stat(filePath)
        if (s.mtimeMs < cutoff) {
          await unlink(filePath)
          logForDebugging(`Pruned old trajectory file: ${filePath}`)
        }
      } catch {
        // ignore per-file errors
      }
    }
  } catch {
    // directory may not exist yet
  }
}

export class TrajectoryLogger {
  private trajectoryDir: string
  private sideQueryFn: SideQueryFunction

  constructor(trajectoryDir?: string, sideQueryFn?: SideQueryFunction) {
    this.trajectoryDir = trajectoryDir || getTrajectoryDir()
    this.sideQueryFn = sideQueryFn || sideQuery
  }

  async log(
    sessionId: string,
    model: string,
    messages: unknown[],
    toolCalls: unknown[],
    finalResponse: string,
  ): Promise<void> {
    try {
      await mkdir(this.trajectoryDir, { recursive: true, mode: 0o700 })
      await pruneOldFiles(this.trajectoryDir, '.jsonl', getRetentionDays())
      const entry: TrajectoryEntry = {
        timestamp: Date.now(),
        session_id: sessionId,
        model,
        messages,
        tool_calls: toolCalls,
        final_response: finalResponse,
      }
      const filePath = join(this.trajectoryDir, `${sessionId}.jsonl`)
      await appendFile(filePath, JSON.stringify(entry) + '\n', { mode: 0o600 })
    } catch (e) {
      logForDebugging(`TrajectoryLogger.log failed: ${e instanceof Error ? e.message : String(e)}`, { level: 'error' })
    }
  }

  /**
   * Analyze trajectories for a session and generate a skill update suggestion.
   * This creates a real feedback loop from logs → analysis → skill proposal.
   */
  async analyzeTrajectory(sessionId: string): Promise<TrajectoryAnalysis | null> {
    try {
      const filePath = join(this.trajectoryDir, `${sessionId}.jsonl`)
      const data = await readFile(filePath, 'utf-8')
      const entries = data
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as TrajectoryEntry)

      if (entries.length === 0) return null

      const combined = entries.map(e => e.final_response).join('\n\n---\n\n')

      const systemPrompt = `You are a trajectory analyst. Given a set of conversation trajectories, identify:
1. Recurring patterns or successful workflows
2. A kebab-case skill name that captures the workflow
3. A concise SKILL.md markdown (with frontmatter) that encodes the workflow as a reusable skill.

Respond in this exact format:
PATTERNS:
- pattern 1
- pattern 2

SKILL_NAME: <kebab-case-name>

SKILL_MD:
<the full SKILL.md content>`

      const response = await this.sideQueryFn({
        querySource: 'trajectory_analyzer',
        model: process.env.CLAUDE_HERMES_SKILL_MODEL || DEFAULT_MODEL,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Trajectories:\n\n${combined.slice(0, 8000)}` }],
        max_tokens: 2048,
        temperature: 0.3,
      })

      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as { text: string }).text)
        .join('\n')

      const patterns = text
        .split('PATTERNS:')[1]?.split('SKILL_NAME:')[0]
        ?.split('\n')
        .map(s => s.trim())
        .filter(s => s.startsWith('- '))
        .map(s => s.slice(2).trim()) || []

      const skillNameMatch = text.match(/SKILL_NAME:\s*(.+)/)
      const skillMdMatch = text.split('SKILL_MD:')[1]

      if (!skillMdMatch) {
        logForDebugging('TrajectoryLogger.analyzeTrajectory: no SKILL_MD found in response')
        return null
      }

      return {
        patterns,
        suggestedSkillName: skillNameMatch?.[1]?.trim() || `trajectory-skill-${Date.now()}`,
        suggestedSkillMarkdown: skillMdMatch.trim(),
      }
    } catch (e) {
      logForDebugging(`TrajectoryLogger.analyzeTrajectory failed: ${e instanceof Error ? e.message : String(e)}`, { level: 'error' })
      return null
    }
  }
}

export function getTrajectoryLogger(): TrajectoryLogger {
  const dir = process.env.CLAUDE_HERMES_TRAJECTORY_DIR || getGlobalConfig().hermesTrainingTrajectoryDir
  return new TrajectoryLogger(dir)
}
