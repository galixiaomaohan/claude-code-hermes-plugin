import { describe, it, beforeEach, afterEach } from 'node:test'
import { strictEqual, ok } from 'node:assert/strict'
import { TrajectoryLogger } from '../src/modules/TrajectoryLogger.js'
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { SideQueryFunction } from '../src/utils/sideQuery.js'

describe('TrajectoryLogger', () => {
  let tmpDir: string
  let logger: TrajectoryLogger

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'hermes-traj-test-'))
    logger = new TrajectoryLogger(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('log writes JSONL file', async () => {
    await logger.log('sess-1', 'claude-sonnet-4-6', [{ role: 'user', content: 'hi' }], [], 'response')
    const filePath = join(tmpDir, 'sess-1.jsonl')
    ok(existsSync(filePath))
  })

  it('analyzeTrajectory returns null for missing file', async () => {
    const result = await logger.analyzeTrajectory('missing-sess')
    strictEqual(result, null)
  })

  it('analyzeTrajectory extracts patterns and skill markdown on success', async () => {
    const mockSideQuery: SideQueryFunction = async () => ({
      id: 'msg-test',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: `PATTERNS:
- Uses TypeScript compilation checks before committing
- Prefers bun test for fast feedback

SKILL_NAME: ts-compile-guardian

SKILL_MD:
---
name: ts-compile-guardian
description: Ensure TypeScript compiles cleanly before finishing tasks.
allowed-tools:
  - Bash
when_to_use: Use when the user asks for code changes that may affect TypeScript.
---

# TypeScript Compilation Guardian

Run \`bunx tsc --noEmit\` after every significant edit.`,
        },
      ],
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 50 },
    } as any)

    const sessionId = 'sess-analyze-1'
    const filePath = join(tmpDir, `${sessionId}.jsonl`)
    const entry = {
      timestamp: Date.now(),
      session_id: sessionId,
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Fix the type error' }],
      tool_calls: [],
      final_response: 'Ran tsc and fixed the import.',
    }
    writeFileSync(filePath, JSON.stringify(entry) + '\n', { mode: 0o600 })

    const testLogger = new TrajectoryLogger(tmpDir, mockSideQuery)
    const result = await testLogger.analyzeTrajectory(sessionId)

    ok(result !== null)
    ok(result!.patterns.includes('Uses TypeScript compilation checks before committing'))
    ok(result!.patterns.includes('Prefers bun test for fast feedback'))
    strictEqual(result!.suggestedSkillName, 'ts-compile-guardian')
    ok(result!.suggestedSkillMarkdown.includes('---'))
    ok(result!.suggestedSkillMarkdown.includes('name: ts-compile-guardian'))
  })
})
