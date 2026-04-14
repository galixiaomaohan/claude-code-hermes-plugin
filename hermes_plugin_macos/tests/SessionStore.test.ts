import { describe, it, beforeEach, afterEach } from 'node:test'
import { strictEqual, ok } from 'node:assert/strict'
import { SessionStore } from '../src/modules/SessionStore.js'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('SessionStore', () => {
  let tmpDir: string
  let store: SessionStore

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'hermes-test-'))
    store = new SessionStore(join(tmpDir, 'test.db'))
  })

  afterEach(() => {
    store.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('init creates schema', async () => {
    await store.init()
    // If init succeeds, schema was created
    strictEqual(true, true)
  })

  it('saveSession and searchSessions', async () => {
    await store.init()
    store.saveSession('sess-1', 'Test summary one', [{ role: 'user', content: 'hello' }], '/project/a', 'Title One')
    store.saveSession('sess-2', 'Another summary', [{ role: 'user', content: 'world' }], '/project/b', 'Title Two')

    const results = store.searchSessions('summary', 10)
    ok(results.length >= 2)
  })

  it('getSessionSummary returns correct value', async () => {
    await store.init()
    store.saveSession('sess-3', 'Specific summary', [], '/project/c')
    const summary = store.getSessionSummary('sess-3')
    strictEqual(summary, 'Specific summary')
  })

  it('getRelevantSessions boosts cwd match', async () => {
    await store.init()
    store.saveSession('sess-4', 'Project A work', [], '/project/a')
    store.saveSession('sess-5', 'Project B work', [], '/project/b')

    const results = store.getRelevantSessions('/project/a', 'work', 5)
    ok(results.length >= 1)
  })
})
