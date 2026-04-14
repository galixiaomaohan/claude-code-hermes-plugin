import { describe, it } from 'node:test'
import { strictEqual } from 'node:assert/strict'
import { spawnSync } from 'child_process'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('compilation', () => {
  it('TypeScript compiles with zero errors across all source files', () => {
    const result = spawnSync('npx', ['tsc', '--noEmit'], {
      cwd: projectRoot,
      shell: false,
      encoding: 'utf-8',
    })
    strictEqual(result.status, 0, `TypeScript compilation failed:\n${result.stdout}\n${result.stderr}`)
  })
})
