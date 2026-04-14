import { describe, it } from 'node:test'
import { rejects } from 'node:assert'
import { sideQuery } from '../src/utils/sideQuery.js'

describe('sideQuery', () => {
  it('throws without user consent', async () => {
    delete process.env.HERMES_ALLOW_SIDE_QUERY
    delete process.env.ANTHROPIC_API_KEY
    await rejects(
      sideQuery({
        querySource: 'test',
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'hello' }],
      }),
      { message: /requires explicit user consent/ }
    )
  })

  it('throws without API key even with consent', async () => {
    process.env.HERMES_ALLOW_SIDE_QUERY = 'true'
    delete process.env.ANTHROPIC_API_KEY
    await rejects(
      sideQuery({
        querySource: 'test',
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'hello' }],
      }),
      { message: /ANTHROPIC_API_KEY is required/ }
    )
  })
})
