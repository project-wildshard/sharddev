import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

// SHARD-COMPAT CP18b: a shard's tests import the harness under plain Node (not Vite), through the dev package's
// Node entry. Vite hid that engine's physics package has no Node entry of its own; this keeps that from coming back.
const dev = fileURLToPath(new URL('../..', import.meta.url))
const probe = [
  "const proof = await import('@wildshard/dev/test/proof')",
  "const quest = await import('@wildshard/dev/test/quest')",
  'console.log(JSON.stringify([typeof proof.openShardProof, typeof proof.openShardSim, typeof proof.questLedger, typeof quest.authoredQuest]))',
].join(';')

describe('the harness under plain Node', (): void => {
  it('imports through @wildshard/dev/test/node', (): void => {
    const run = spawnSync(
      process.execPath,
      [
        '--import',
        '@wildshard/dev/test/node',
        '--input-type=module',
        '-e',
        probe,
      ],
      { cwd: dev, encoding: 'utf8', timeout: 120_000 },
    )
    assert.equal(run.status, 0, run.stderr)
    assert.equal(
      run.stdout.trim(),
      JSON.stringify(['function', 'function', 'function', 'function']),
    )
  })
})
