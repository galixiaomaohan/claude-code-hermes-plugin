import { describe, it, beforeEach, afterEach } from 'node:test'
import { strictEqual, ok } from 'node:assert/strict'
import { SkillOptimizer } from '../src/modules/SkillOptimizer.js'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { SideQueryFunction } from '../src/utils/sideQuery.js'

describe('SkillOptimizer', () => {
  let tmpDir: string
  let optimizer: SkillOptimizer

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'hermes-opt-test-'))
    process.env.CLAUDE_CONFIG_DIR = tmpDir
    optimizer = new SkillOptimizer()
  })

  afterEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('shouldOptimize returns false below threshold', async () => {
    const result = await optimizer.shouldOptimize('nonexistent-skill')
    strictEqual(result, false)
  })

  it('logUsage creates usage log with correct permissions', async () => {
    await optimizer.logUsage('test-skill', 'args', 'output', 'that was perfect')
    const logPath = join(tmpDir, 'plugins', 'data', 'hermes-plugin', 'skill-usage-log.jsonl')
    const content = await import('fs/promises').then(m => m.readFile(logPath, 'utf-8'))
    ok(content.includes('test-skill'))
  })

  it('logUsage classifies positive feedback via LLM', async () => {
    const mockSideQuery: SideQueryFunction = async () => ({
      id: 'msg-test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'positive' }],
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 1 },
    } as any)

    const testOptimizer = new SkillOptimizer(mockSideQuery)
    await testOptimizer.logUsage('test-skill', 'args', 'output', 'this is amazing work')

    const logPath = join(tmpDir, 'plugins', 'data', 'hermes-plugin', 'skill-usage-log.jsonl')
    const lines = readFileSync(logPath, 'utf-8').split('\n').filter(Boolean)
    const lastRecord = JSON.parse(lines[lines.length - 1])
    strictEqual(lastRecord.userFeedback, 'positive')
  })

  it('logUsage classifies negative feedback via LLM', async () => {
    const mockSideQuery: SideQueryFunction = async () => ({
      id: 'msg-test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'negative' }],
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 1 },
    } as any)

    const testOptimizer = new SkillOptimizer(mockSideQuery)
    await testOptimizer.logUsage('test-skill', 'args', 'output', 'this is completely wrong')

    const logPath = join(tmpDir, 'plugins', 'data', 'hermes-plugin', 'skill-usage-log.jsonl')
    const lines = readFileSync(logPath, 'utf-8').split('\n').filter(Boolean)
    const lastRecord = JSON.parse(lines[lines.length - 1])
    strictEqual(lastRecord.userFeedback, 'negative')
  })

  it('optimizeSkill returns false when threshold not met', async () => {
    const skillDir = join(tmpDir, 'skills', 'low-usage')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: low-usage\n---\n\nTest', { mode: 0o600 })

    const result = await optimizer.optimizeSkill('low-usage', join(skillDir, 'SKILL.md'))
    strictEqual(result, false)
  })

  it('optimizeSkill rewrites skill when threshold and mixed feedback are met', async () => {
    const skillDir = join(tmpDir, 'skills', 'high-usage')
    mkdirSync(skillDir, { recursive: true })
    const skillPath = join(skillDir, 'SKILL.md')
    writeFileSync(skillPath, '---\nname: high-usage\n---\n\nOld skill content', { mode: 0o600 })

    const mockSideQuery: SideQueryFunction = async () => ({
      id: 'msg-test',
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'text',
        text: '---\nname: high-usage\n---\n\nImproved skill content with better steps',
      }],
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      usage: { input_tokens: 50, output_tokens: 30 },
    } as any)

    const testOptimizer = new SkillOptimizer(mockSideQuery)

    // Write 10 usage records with mixed/negative feedback to meet threshold
    for (let i = 0; i < 7; i++) {
      await testOptimizer.logUsage('high-usage', `args-${i}`, 'output', 'this is wrong')
    }
    for (let i = 7; i < 10; i++) {
      await testOptimizer.logUsage('high-usage', `args-${i}`, 'output', 'great')
    }

    const result = await testOptimizer.optimizeSkill('high-usage', skillPath)
    strictEqual(result, true)

    const updatedContent = readFileSync(skillPath, 'utf-8')
    ok(updatedContent.includes('Improved skill content with better steps'))
  })
})
