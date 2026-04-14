import { describe, it, beforeEach, afterEach } from 'node:test'
import { strictEqual, ok, match } from 'node:assert/strict'
import { AutoSkillCreator } from '../src/modules/AutoSkillCreator.js'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { SideQueryFunction } from '../src/utils/sideQuery.js'
import type { Message } from '../src/types.js'

describe('AutoSkillCreator', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'hermes-skill-test-'))
    process.env.CLAUDE_CONFIG_DIR = tmpDir
  })

  afterEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('analyzeAndCreate writes skill file on LLM success', async () => {
    const mockSideQuery: SideQueryFunction = async () => ({
      id: 'msg-test',
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'text',
        text: `---
name: test-skill
description: Auto-created skill from conversation
allowed-tools:
  - Read
when_to_use: Use when the user asks for similar tasks.
---

# Test Skill

Follow the conversation pattern observed.`,
      }],
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      usage: { input_tokens: 50, output_tokens: 30 },
    } as any)

    const creator = new AutoSkillCreator(mockSideQuery)
    const messages: Message[] = [
      {
        type: 'user',
        message: { content: 'Please create a skill for running TypeScript type checks.' },
      },
    ]

    const result = await creator.analyzeAndCreate(messages, { targetDir: 'project', projectCwd: tmpDir })

    ok(result !== null)
    ok(result!.skillPath.includes('test-skill/SKILL.md'))
    ok(result!.frontmatter.includes('name: test-skill'))

    const fileContent = readFileSync(result!.skillPath, 'utf-8')
    ok(fileContent.includes('---'))
    ok(fileContent.includes('name: test-skill'))

    // Verify strict permissions via stat
    const { statSync } = await import('fs')
    const stats = statSync(result!.skillPath)
    const mode = stats.mode & 0o777
    strictEqual(mode, 0o600)
  })

  it('analyzeAndCreate returns null when LLM output lacks frontmatter', async () => {
    const mockSideQuery: SideQueryFunction = async () => ({
      id: 'msg-test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Here is a skill without frontmatter delimiters.' }],
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 10 },
    } as any)

    const creator = new AutoSkillCreator(mockSideQuery)
    const messages: Message[] = [
      { type: 'user', message: { content: 'Hello' } },
    ]

    const result = await creator.analyzeAndCreate(messages, { targetDir: 'project', projectCwd: tmpDir })
    strictEqual(result, null)
  })
})
