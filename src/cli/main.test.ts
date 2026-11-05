import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import type { SpawnSyncReturns } from 'node:child_process'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { readVersion } from './version.ts'

const MAIN = fileURLToPath(new URL('main.ts', import.meta.url))

function cli(
  args: readonly string[],
  env: Readonly<Record<string, string>> = {},
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [MAIN, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], ...env },
  })
}

describe('the sharddev CLI', (): void => {
  it('prints the package version for --version', async (): Promise<void> => {
    const run = cli(['--version'])

    assert.equal(run.status, 0)
    assert.equal(run.stdout.trim(), await readVersion())
  })

  it('prints usage for --help and exits 0', (): void => {
    const run = cli(['--help'])

    assert.equal(run.status, 0)
    assert.match(run.stdout, /^Usage: sharddev /u)
  })

  it('rejects an unknown command with exit 1', (): void => {
    const run = cli(['nope'])

    assert.equal(run.status, 1)
    assert.match(run.stderr, /unknown command nope/u)
  })
})

describe('the upload command', (): void => {
  it('needs a shardfile to upload', (): void => {
    const run = cli(['upload'])

    assert.equal(run.status, 1)
    assert.match(run.stderr, /upload needs a shardfile/u)
  })

  it('needs a server and a key to upload', (): void => {
    const run = cli(['upload', 'shard.tar'])

    assert.equal(run.status, 1)
    assert.match(run.stderr, /WILDSHARD_CREATOR_PRIVATE_KEY/u)
  })

  it('refuses a level Brotli does not have', (): void => {
    const run = cli(['upload', 'shard.tar', '--level', '12'])

    assert.equal(run.status, 1)
    assert.match(run.stderr, /invalid --level 12/u)
  })

  it('exits 3 and says why when an upload fails', (): void => {
    const args = [
      'upload',
      '/nonexistent.tar',
      '--server',
      'http://127.0.0.1:9',
    ]
    const run = cli(args, { WILDSHARD_CREATOR_PRIVATE_KEY: 'unused' })

    assert.equal(run.status, 3)
    assert.match(run.stderr, /upload failed: .*ENOENT/u)
  })
})
