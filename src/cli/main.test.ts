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
const CHANNEL = ['--channel', 'staging']

describe('the sharddev CLI', (): void => {
  it('prints the sdk, engine, format and three chain for --version', async (): Promise<void> => {
    const run = cli(['--version'])

    assert.equal(run.status, 0)
    const lines = run.stdout.trim().split('\n')
    assert.equal(lines[0], `@wildshard/sdk ${await readVersion()}`)
    assert.deepEqual(
      lines.map((line: string): string | undefined => line.split(' ')[0]),
      ['@wildshard/sdk', '@wildshard/engine', '@wildshard/format', 'three'],
    )
    for (const line of lines) {
      assert.match(line, /^\S+ \d+\.\d+\.\d+/u)
    }
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

describe('the pack command, folded into build (SA3)', (): void => {
  it('says once that it is deprecated and names build', (): void => {
    const run = cli(['pack'])
    const deprecated = run.stderr.match(/pack is deprecated/gu) ?? []

    assert.equal(deprecated.length, 1)
    assert.match(run.stderr, /`wildshard build <folder> \[file\]`/u)
  })

  it('needs a shard file folder', (): void => {
    const run = cli(['pack'])

    assert.equal(run.status, 1)
    assert.match(run.stderr, /pack needs a shard file folder/u)
  })

  it('reports a folder that is not a shard file folder', (): void => {
    const run = cli(['pack', 'no-such-folder'])

    assert.equal(run.status, 3)
    assert.match(run.stderr, /pack failed/u)
  })
})

describe('build of a built folder (SA3)', (): void => {
  it('reports a folder that is not a shard file folder', (): void => {
    const run = cli(['build', 'no-such-folder'])

    assert.equal(run.status, 3)
    assert.match(run.stderr, /build failed: .*ENOENT/u)
    assert.match(run.stderr, /\[shardfile-folder-missing\]/u)
    assert.doesNotMatch(run.stderr, /deprecated/u)
  })
})

describe('the upload command', (): void => {
  it('needs a shardfile to upload', (): void => {
    const run = cli(['upload'])

    assert.equal(run.status, 1)
    assert.match(run.stderr, /upload needs a shardfile/u)
  })

  it('needs --channel staging or prod (J301)', (): void => {
    const run = cli(['upload', 'shard.tar'])

    assert.equal(run.status, 1)
    assert.match(
      run.stderr,
      /upload needs --channel staging or --channel prod/u,
    )
  })

  it('needs a server and a key to upload', (): void => {
    const run = cli(['upload', 'shard.tar', ...CHANNEL])

    assert.equal(run.status, 1)
    assert.match(run.stderr, /WILDSHARD_CREATOR_PRIVATE_KEY/u)
  })

  it('refuses a level Brotli does not have', (): void => {
    const run = cli(['upload', 'shard.tar', '--level', '12', ...CHANNEL])

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
      ...CHANNEL,
    ]
    const run = cli(args, { WILDSHARD_CREATOR_PRIVATE_KEY: 'unused' })

    assert.equal(run.status, 3)
    assert.match(run.stderr, /upload failed: .*ENOENT/u)
  })
})

// SA21: every pack and upload refusal names its rule, a fix and its
// GUIDE.md section on the line after its reason.
const REFUSALS: readonly (readonly [readonly string[], string])[] = [
  [['pack'], 'shardfile-folder-missing'],
  [['pack', 'no-such-folder'], 'shardfile-folder-missing'],
  [['upload'], 'upload-shardfile-missing'],
  [['upload', 'shard.tar'], 'upload-channel'],
  [['upload', 'shard.tar', ...CHANNEL], 'upload-credentials'],
  [['upload', 'shard.tar', '--level', '12', ...CHANNEL], 'upload-level'],
]

/** The refusal's second line: `[rule] fix: ... (GUIDE.md#rule)`. */
function assertRule(stderr: string, rule: string): void {
  const hint = String.raw`\n  \[${rule}\] fix: .+\. \(GUIDE\.md#${rule}\)\n`
  assert.match(stderr, new RegExp(hint, 'u'))
}

describe('pack and upload refusals (SA21)', (): void => {
  it('name their rule, a fix and a GUIDE.md section', (): void => {
    for (const [args, rule] of REFUSALS) {
      assertRule(cli(args).stderr, rule)
    }
    const upload = ['upload', '/nonexistent.tar', '--server', 'http://x']
    const run = cli([...upload, ...PROVENANCE, ...CHANNEL], {
      WILDSHARD_CREATOR_PRIVATE_KEY: 'unused',
    })
    assertRule(run.stderr, 'upload-shardfile-missing')
    const commit = [
      ...upload,
      ...CHANNEL,
      '--version',
      '0.0.1',
      '--commit',
      'abc',
    ]
    const unsure = cli(commit, { WILDSHARD_CREATOR_PRIVATE_KEY: 'unused' })
    assertRule(unsure.stderr, 'upload-commit')
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
  const server = ['--server', 'http://127.0.0.1:9', ...CHANNEL]

  it('refuses a dirty shard project before any request', async (): Promise<void> => {
    const dir = await dirtyProject()
    try {
      const run = cli(['upload', 'shard.tar', ...server], key, dir)

      assert.equal(run.status, 1)
      assert.match(run.stderr, /uncommitted changes/u)
      assertRule(run.stderr, 'upload-uncommitted')
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('prints the CLI version for --version before upload', async (): Promise<void> => {
    const run = cli(['--version', 'upload', 'shard.tar'])

    assert.equal(run.status, 0)
    assert.equal(
      run.stdout.split('\n')[0],
      `@wildshard/sdk ${await readVersion()}`,
    )
  })

  it('takes --version as the shard version after upload', (): void => {
    const args = ['upload', '/nonexistent.tar', ...server, '--version', 'v1']

    const run = cli(args, key)

    assert.equal(run.status, 1)
    assert.match(run.stderr, /--version v1 is not X\.Y\.Z/u)
    assertRule(run.stderr, 'upload-version')
  })
})
