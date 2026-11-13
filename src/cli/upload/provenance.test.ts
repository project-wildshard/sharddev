import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import { readVersion } from '../version.ts'
import { resolveProvenance } from './provenance.ts'

// API-CLOUDFLARE AC16 (V1): every upload names the shard version and the
// commit it was built from. The defaults come from the shard project the
// author runs `wildshard upload` in: its package.json and its git HEAD.
// J306 (SHARD-AUTHORING UP3) adds the versions it was built with:
// sharddev's own, and engine's and shard-format's as the shard resolves
// them, or as this sharddev does when the shard has none installed.

const SHA = 'a'.repeat(40)
const ROOT = new URL('../../../', import.meta.url)

async function installed(name: string): Promise<string> {
  const file = new URL(`node_modules/${name}/package.json`, ROOT)
  const raw: unknown = JSON.parse(await readFile(file, 'utf8'))
  assert.ok(typeof raw === 'object' && raw !== null && 'version' in raw)
  assert.equal(typeof raw.version, 'string')
  return String(raw.version)
}

/** What this sharddev carries: the fallback for a shard with no install. */
async function carried(): Promise<
  Readonly<{ sharddev: string; engine: string; shardFormat: string }>
> {
  return {
    sharddev: await readVersion(),
    engine: await installed('@wildshard/engine'),
    shardFormat: await installed('@wildshard/format'),
  }
}

/** Write node_modules/<name>/package.json under `dir`. */
async function install(
  dir: string,
  name: string,
  version: string,
): Promise<void> {
  const folder = path.join(dir, 'node_modules', ...name.split('/'))
  await mkdir(folder, { recursive: true })
  await writeFile(
    path.join(folder, 'package.json'),
    `${JSON.stringify({ name, version })}\n`,
  )
}

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
    ...(await carried()),
  })
})

test('finds the project from a folder inside it', async (context: TestContext): Promise<void> => {
  const { dir, head } = await project(context)
  const inner = path.join(dir, 'out', 'packs')
  await mkdir(inner, { recursive: true })

  assert.deepEqual(await resolveProvenance({ cwd: inner }), {
    version: '0.0.3',
    commit: head,
    ...(await carried()),
  })
})

test('flags override both, and need no git checkout', async (context: TestContext): Promise<void> => {
  const dir = await scratch(context)

  assert.deepEqual(
    await resolveProvenance({ cwd: dir, version: '1.2.3', commit: SHA }),
    { version: '1.2.3', commit: SHA, ...(await carried()) },
  )
})

test('the three versions match the installed packages (J306)', async (context: TestContext): Promise<void> => {
  const dir = await scratch(context)
  const { sharddev, engine, shardFormat } = await resolveProvenance({
    cwd: dir,
    version: '0.0.1',
    commit: SHA,
  })

  assert.equal(sharddev, await readVersion())
  assert.equal(engine, await installed('@wildshard/engine'))
  assert.equal(shardFormat, await installed('@wildshard/format'))
  assert.match(engine, /^\d+\.\d+\.\d+$/u)
  assert.match(shardFormat, /^\d+\.\d+\.\d+$/u)
})

test("reads engine and shard-format from the shard's own install", async (context: TestContext): Promise<void> => {
  const dir = await scratch(context)
  await install(dir, '@wildshard/engine', '7.8.9')
  await install(dir, '@wildshard/format', '4.5.6')
  const inner = path.join(dir, 'out')
  await mkdir(inner)

  const provenance = await resolveProvenance({
    cwd: inner,
    version: '0.0.1',
    commit: SHA,
  })

  assert.equal(provenance.engine, '7.8.9')
  assert.equal(provenance.shardFormat, '4.5.6')
  assert.equal(provenance.sharddev, await readVersion())
})

test('@wildshard/shard-format wins over the @wildshard/format alias', async (context: TestContext): Promise<void> => {
  const dir = await scratch(context)
  await install(dir, '@wildshard/format', '4.5.6')
  await install(dir, '@wildshard/shard-format', '5.0.0')

  const { shardFormat } = await resolveProvenance({
    cwd: dir,
    version: '0.0.1',
    commit: SHA,
  })

  assert.equal(shardFormat, '5.0.0')
})

test('refuses an installed version the API would refuse', async (context: TestContext): Promise<void> => {
  const dir = await scratch(context)
  await install(dir, '@wildshard/engine', '0.1.0-rc.1')

  await assert.rejects(
    resolveProvenance({ cwd: dir, version: '0.0.1', commit: SHA }),
    /@wildshard\/engine 0\.1\.0-rc\.1 .* is not X\.Y\.Z/u,
  )
})

test('refuses a dirty tree when the commit comes from HEAD', async (context: TestContext): Promise<void> => {
  const { dir } = await project(context)
  await writeFile(path.join(dir, 'package.json'), '{"version":"0.0.4"}\n')

  await assert.rejects(
    resolveProvenance({ cwd: dir }),
    /the shard source has uncommitted changes .*--commit <sha>/u,
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
