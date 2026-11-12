import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import type { SpawnSyncReturns } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { readVersion } from './version.ts'

const MAIN = fileURLToPath(new URL('main.ts', import.meta.url))

function cli(
  args: readonly string[],
  env: Readonly<Record<string, string>> = {},
  cwd?: string,
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [MAIN, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'], ...env },
    ...(cwd === undefined ? {} : { cwd }),
  })
}

const PROVENANCE = ['--version', '0.0.1', '--commit', 'c'.repeat(40)]

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

describe('the pack command', (): void => {
  it('needs a product folder', (): void => {
    const run = cli(['pack'])

    assert.equal(run.status, 1)
    assert.match(run.stderr, /pack needs a product folder/u)
  })

  it('reports a folder that is not a product', (): void => {
    const run = cli(['pack', 'no-such-folder'])

    assert.equal(run.status, 3)
    assert.match(run.stderr, /pack failed/u)
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
      ...PROVENANCE,
    ]
    const run = cli(args, { WILDSHARD_CREATOR_PRIVATE_KEY: 'unused' })

    assert.equal(run.status, 3)
    assert.match(run.stderr, /upload failed: .*ENOENT/u)
  })
})

/** A committed project at 0.0.1 with an uncommitted edit to package.json. */
async function dirtyProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'sharddev-dirty-'))
  const git = (args: readonly string[]): void => {
    execFileSync('git', [...args], { cwd: dir })
  }
  const author = ['-c', 'user.name=t', '-c', 'user.email=t@t']
  await writeFile(path.join(dir, 'package.json'), '{"version":"0.0.1"}\n')
  git(['init', '--quiet'])
  git(['add', 'package.json'])
  git([...author, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'init'])
  await writeFile(path.join(dir, 'package.json'), '{"version":"0.0.2"}\n')
  return dir
}

describe("the upload's shard version and commit (AC16)", (): void => {
  const key = { WILDSHARD_CREATOR_PRIVATE_KEY: 'unused' }
  const server = ['--server', 'http://127.0.0.1:9']

  it('refuses a dirty shard project before any request', async (): Promise<void> => {
    const dir = await dirtyProject()
    try {
      const run = cli(['upload', 'shard.tar', ...server], key, dir)

      assert.equal(run.status, 1)
      assert.match(run.stderr, /uncommitted changes/u)
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('prints the CLI version for --version before upload', async (): Promise<void> => {
    const run = cli(['--version', 'upload', 'shard.tar'])

    assert.equal(run.status, 0)
    assert.equal(run.stdout.trim(), await readVersion())
  })

  it('takes --version as the shard version after upload', (): void => {
    const args = ['upload', '/nonexistent.tar', ...server, '--version', 'v1']

    const run = cli(args, key)

    assert.equal(run.status, 1)
    assert.match(run.stderr, /--version v1 is not X\.Y\.Z/u)
  })
})
