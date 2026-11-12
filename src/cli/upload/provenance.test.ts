import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import { resolveProvenance } from './provenance.ts'

// API-CLOUDFLARE AC16 (V1): every upload names the shard version and the
// commit it was built from. The defaults come from the shard project the
// author runs `wildshard upload` in: its package.json and its git HEAD.

const SHA = 'a'.repeat(40)

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim()
}

async function scratch(context: TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'sharddev-provenance-'))
  context.after(async (): Promise<void> => {
    await rm(directory, { recursive: true })
  })
  return directory
}

/** A committed shard project at version 0.0.3; its HEAD. */
async function project(
  context: TestContext,
): Promise<Readonly<{ dir: string; head: string }>> {
  const dir = await scratch(context)
  await writeFile(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name: 'shard-test', version: '0.0.3' })}\n`,
  )
  git(dir, ['init', '--quiet'])
  git(dir, ['add', 'package.json'])
  git(dir, [
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '--quiet',
    '-m',
    'init',
  ])
  return { dir, head: git(dir, ['rev-parse', 'HEAD']) }
}

test("defaults to the project's package.json version and HEAD", async (context: TestContext): Promise<void> => {
  const { dir, head } = await project(context)

  assert.deepEqual(await resolveProvenance({ cwd: dir }), {
    version: '0.0.3',
    commit: head,
  })
})

test('finds the project from a folder inside it', async (context: TestContext): Promise<void> => {
  const { dir, head } = await project(context)
  const inner = path.join(dir, 'out', 'packs')
  await mkdir(inner, { recursive: true })

  assert.deepEqual(await resolveProvenance({ cwd: inner }), {
    version: '0.0.3',
    commit: head,
  })
})

test('flags override both, and need no git checkout', async (context: TestContext): Promise<void> => {
  const dir = await scratch(context)

  assert.deepEqual(
    await resolveProvenance({ cwd: dir, version: '1.2.3', commit: SHA }),
    { version: '1.2.3', commit: SHA },
  )
})

test('refuses a dirty tree when the commit comes from HEAD', async (context: TestContext): Promise<void> => {
  const { dir } = await project(context)
  await writeFile(path.join(dir, 'package.json'), '{"version":"0.0.4"}\n')

  await assert.rejects(
    resolveProvenance({ cwd: dir }),
    /the shard project has uncommitted changes .*--commit <sha>/u,
  )
})

test('an untracked file, such as the packed tarball, is not dirt', async (context: TestContext): Promise<void> => {
  const { dir, head } = await project(context)
  await writeFile(path.join(dir, 'shard.tar'), 'bytes')

  const { commit } = await resolveProvenance({ cwd: dir })

  assert.equal(commit, head)
})

test('needs --commit outside a git checkout', async (context: TestContext): Promise<void> => {
  const dir = await scratch(context)

  await assert.rejects(
    resolveProvenance({ cwd: dir, version: '0.0.1' }),
    /not a git checkout.*--commit <sha>/u,
  )
})

test('needs --version without a package.json version', async (context: TestContext): Promise<void> => {
  const dir = await scratch(context)
  await writeFile(path.join(dir, 'package.json'), '{"name":"x"}\n')

  await assert.rejects(
    resolveProvenance({ cwd: dir, commit: SHA }),
    /no version in .*package\.json; pass --version X\.Y\.Z/u,
  )
})

test('refuses a version or commit the API would refuse', async (context: TestContext): Promise<void> => {
  const dir = await scratch(context)

  await assert.rejects(
    resolveProvenance({ cwd: dir, version: 'v1.0', commit: SHA }),
    /--version v1\.0 is not X\.Y\.Z/u,
  )
  await assert.rejects(
    resolveProvenance({ cwd: dir, version: '01.0.0', commit: SHA }),
    /--version 01\.0\.0 is not X\.Y\.Z/u,
  )
  await assert.rejects(
    resolveProvenance({ cwd: dir, version: '0.0.1', commit: 'abc123' }),
    /--commit abc123 is not a full 40-hex sha/u,
  )
})
