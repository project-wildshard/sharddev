// J186: real CLI boundary, explicit CI command, outside hook discovery.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

// Hosted runners take 8 s and more for the cold compile that runs in about 3 s locally,
// so the child gets 30 s; a hang still fails.
test(
  'the real CLI executes its bundled recipe compiler',
  { timeout: 35_000 },
  () => {
    mkdirSync('tmp', { recursive: true })
    const root = mkdtempSync(resolve('tmp', 'generation-cli-proof-'))
    try {
      const output = resolve(root, 'new-project')
      const child = spawnSync(
        process.execPath,
        [resolve(import.meta.dirname, '../../bin/wildshard.mjs'), 'new', output, 'cli-cache-proof'],
        {
          env: { ...process.env, WILDSHARD_GEN_CACHE: resolve(root, 'cache') },
          encoding: 'utf8',
          timeout: 30_000,
        },
      )
      assert.equal(child.status, 0, child.stderr)
      assert.ok(existsSync(resolve(output, 'src/shard.config.ts')))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
)
