import { appendFile, mkdir, readFile, writeFile, unlink, stat } from 'fs/promises'
import { dirname, join } from 'path'
import { logForDebugging } from '../utils/debug.js'
import { getHermesPluginDataDir } from '../utils/paths.js'
import { sideQuery, type SideQueryFunction } from '../utils/sideQuery.js'

export type SkillUsageRecord = {
  timestamp: number
  skillName: string
  inputArgs: string
  modelOutput: string
  userFeedback: 'positive' | 'negative' | 'neutral'
}

function getLogPath(): string {
  return join(getHermesPluginDataDir(), 'skill-usage-log.jsonl')
}
const OPTIMIZE_THRESHOLD = 10
const DEFAULT_MODEL = 'claude-sonnet-4-6'
const DEFAULT_RETENTION_DAYS = 90

function getRetentionDays(): number {
  const env = process.env.HERMES_DATA_RETENTION_DAYS
  if (env) {
    const parsed = parseInt(env, 10)
    if (!isNaN(parsed) && parsed >= 0) return parsed
  }
  return DEFAULT_RETENTION_DAYS
}

async function pruneOldLogEntries(logPath: string, retentionDays: number): Promise<void> {
  if (retentionDays <= 0) return
  try {
    const s = await stat(logPath)
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    if (s.mtimeMs < cutoff) {
      await unlink(logPath)
      logForDebugging('Pruned old skill usage log')
      return
    }
    const data = await readFile(logPath, 'utf-8')
    const lines = data.split('\n').filter(Boolean)
    const filtered = lines.filter(line => {
      try {
        const entry = JSON.parse(line) as SkillUsageRecord
        return entry.timestamp >= cutoff
      } catch {
        return false
      }
    })
    if (filtered.length < lines.length) {
      await writeFile(logPath, filtered.join('\n') + (filtered.length > 0 ? '\n' : ''), { mode: 0o600 })
    }
  } catch {
    // file may not exist
  }
}

async function inferFeedbackSemantic(userMessage: string, sideQueryFn: SideQueryFunction = sideQuery): Promise<SkillUsageRecord['userFeedback']> {
  if (!userMessage.trim()) return 'neutral'

  try {
    const response = await sideQueryFn({
      querySource: 'feedback_classifier',
      model: process.env.CLAUDE_HERMES_SKILL_MODEL || DEFAULT_MODEL,
      system: `You are a sentiment classifier. Analyze the user message and classify the sentiment as exactly one of: positive, negative, or neutral. Consider sarcasm, implicit criticism, non-English languages, and specific functional complaints. Respond with ONLY the single word.`,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 10,
      temperature: 0,
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('')
      .toLowerCase()
      .trim()

    if (text.includes('positive')) return 'positive'
    if (text.includes('negative')) return 'negative'
    return 'neutral'
  } catch (e) {
    logForDebugging(`Semantic feedback inference failed, falling back to keywords: ${e instanceof Error ? e.message : String(e)}`, { level: 'warn' })
    // Fallback to original keyword heuristic
    const lower = userMessage.toLowerCase()
    const positive = ['perfect', 'great', 'thanks', 'awesome', 'good', 'excellent', 'works', 'worked', 'nice']
    const negative = ['wrong', 'bad', 'incorrect', 'fix', 'error', 'fail', 'broken', 'terrible', 'horrible', 'awful']
    const negationPrefixes = ['not ', 'no ', 'don\'t ', 'doesn\'t ', 'didn\'t ', 'isn\'t ', 'wasn\'t ', 'never ']

    const hasNegation = negationPrefixes.some(p => lower.includes(p))
    const hasPositive = positive.some(p => lower.includes(p))
    const hasNegative = negative.some(n => lower.includes(n))

    if (hasNegation && lower.includes('no problem')) return 'positive'
    if (hasNegation && lower.includes('not bad')) return 'positive'
    if (hasNegation && hasPositive) return 'negative'
    if (hasNegation && hasNegative) return 'positive'
    if (hasPositive) return 'positive'
    if (hasNegative) return 'negative'
    return 'neutral'
  }
}

export class SkillOptimizer {
  private sideQueryFn: SideQueryFunction

  constructor(sideQueryFn?: SideQueryFunction) {
    this.sideQueryFn = sideQueryFn || sideQuery
  }

  async logUsage(skillName: string, inputArgs: string, modelOutput: string, subsequentUserMessage?: string): Promise<void> {
    const record: SkillUsageRecord = {
      timestamp: Date.now(),
      skillName,
      inputArgs,
      modelOutput: modelOutput.slice(0, 2000),
      userFeedback: subsequentUserMessage ? await inferFeedbackSemantic(subsequentUserMessage, this.sideQueryFn) : 'neutral',
    }
    try {
      await mkdir(dirname(getLogPath()), { recursive: true, mode: 0o700 })
      await pruneOldLogEntries(getLogPath(), getRetentionDays())
      await appendFile(getLogPath(), JSON.stringify(record) + '\n', { mode: 0o600 })
    } catch (e) {
      logForDebugging(`SkillOptimizer.logUsage failed: ${e instanceof Error ? e.message : String(e)}`, { level: 'error' })
    }
  }

  async shouldOptimize(skillName: string): Promise<boolean> {
    try {
      const entries = await this.readLogForSkill(skillName)
      return entries.length >= OPTIMIZE_THRESHOLD
    } catch {
      return false
    }
  }

  private async readLogForSkill(skillName: string): Promise<SkillUsageRecord[]> {
    try {
      const data = await readFile(getLogPath(), 'utf-8')
      return data
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as SkillUsageRecord)
        .filter(r => r.skillName === skillName)
    } catch {
      return []
    }
  }

  async optimizeSkill(skillName: string, skillPath: string): Promise<boolean> {
    const entries = await this.readLogForSkill(skillName)
    if (entries.length < OPTIMIZE_THRESHOLD) return false

    const positiveCount = entries.filter(e => e.userFeedback === 'positive').length
    const negativeCount = entries.filter(e => e.userFeedback === 'negative').length
    if (negativeCount === 0 && positiveCount > entries.length * 0.7) {
      return false
    }

    const systemPrompt = `You are an expert prompt engineer. Improve the following skill markdown based on usage feedback.
Preserve the frontmatter structure. Improve clarity, success criteria, and step specificity.
Respond ONLY with the updated SKILL.md content (including frontmatter delimiters). Do not wrap in markdown code blocks.`

    try {
      const currentSkill = await readFile(skillPath, 'utf-8')

      const feedbackSummary = entries
        .map(e => `- ${e.userFeedback}: args="${e.inputArgs}"`)
        .join('\n')

      const userPrompt = `Current SKILL.md:\n\n${currentSkill}\n\nUsage feedback (${entries.length} calls):\n${feedbackSummary}`

      const response = await this.sideQueryFn({
        querySource: 'skill_optimizer',
        model: process.env.CLAUDE_HERMES_SKILL_MODEL || DEFAULT_MODEL,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 2048,
        temperature: 0.3,
      })

      const textBlocks = response.content.filter(b => b.type === 'text')
      const improved = textBlocks.map(b => (b as { text: string }).text).join('\n').trim()

      if (!improved.includes('---')) {
        logForDebugging('SkillOptimizer: improved content missing frontmatter')
        return false
      }

      await writeFile(skillPath, improved, { mode: 0o600 })
      logForDebugging(`SkillOptimizer: updated ${skillPath}`)
      return true
    } catch (e) {
      logForDebugging(`SkillOptimizer.optimizeSkill failed: ${e instanceof Error ? e.message : String(e)}`, { level: 'error' })
      return false
    }
  }
}

export function getSkillOptimizer(sideQueryFn?: SideQueryFunction): SkillOptimizer {
  return new SkillOptimizer(sideQueryFn)
}
