// oxlint-disable typescript/prefer-readonly-parameter-types -- a run collects what the double saw
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { text } from 'node:stream/consumers'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { readVersion } from '../../../../dev/src/cli/version.ts'
import { makeShardfile } from '../../../../dev/src/test/helpers/shardfile.ts'
import {
  COMMIT,
  VERSION,
  open,
} from '../../../../dev/src/test/helpers/upload-run.ts'

import type { Run } from '../../../../dev/src/test/helpers/upload-run.ts'

const MAIN = fileURLToPath(
  new URL('../../../../dev/src/cli/main.ts', import.meta.url),
)
const ROOT = new URL('../../../../sdk/', import.meta.url)

// UP3 (J301, J306): the channel the upload is for, and the versions it was
// built with, through the real CLI against the double.

interface CliRun {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

async function cli(
  run: Run,
  args: readonly string[],
  cwd = fileURLToPath(ROOT),
): Promise<CliRun> {
  const child = spawn(
    process.execPath,
    [MAIN, 'upload', run.file, '--server', run.server.url, ...args],
    {
      cwd,
      env: {
        PATH: process.env['PATH'],
        WILDSHARD_CREATOR_PRIVATE_KEY: run.server.privateKey,
        WILDSHARD_API_KEY: run.server.apiKey,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const [stdout, stderr] = [text(child.stdout), text(child.stderr)]
  await once(child, 'close')
  return { status: child.exitCode, stdout: await stdout, stderr: await stderr }
}

const PROVENANCE = ['--shard-version', VERSION, '--commit', COMMIT]

async function installed(name: string): Promise<string> {
  const file = new URL(`node_modules/${name}/package.json`, ROOT)
  const raw: unknown = JSON.parse(await readFile(file, 'utf8'))
  assert.ok(typeof raw === 'object' && raw !== null && 'version' in raw)
  return String(raw.version)
}

test('no --channel refuses and makes no request', async (context: TestContext): Promise<void> => {
  const run = await open(context)

  const result = await cli(run, PROVENANCE)

  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stderr, /--channel staging.*--channel prod/u)
  assert.equal(run.server.state.apiRequests.length, 0)
})

test('--channel prod goes on the wire as production', async (context: TestContext): Promise<void> => {
  const run = await open(context)

  const result = await cli(run, [...PROVENANCE, '--channel', 'prod'])

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(run.server.state.commits, [
    {
      contentEncoding: 'br',
      shardVersion: VERSION,
      version: VERSION,
      commit: COMMIT,
      channel: 'production',
      sharddev: await readVersion(),
      engine: await installed('@wildshard/engine'),
      shardFormat: await installed('@wildshard/format'),
    },
  ])
  assert.match(result.stdout, /for production/u)
})

test('--channel staging goes on the wire as staging', async (context: TestContext): Promise<void> => {
  const run = await open(context)

  const result = await cli(run, [...PROVENANCE, '--channel', 'staging'])

  assert.equal(result.status, 0, result.stderr)
  const [body] = run.server.state.commits
  assert.ok(typeof body === 'object' && body !== null && 'channel' in body)
  assert.equal(body.channel, 'staging')
})

test('the CLI sends the exact installed engine next pin to staging', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  const cwd = new URL('.', pathToFileURL(run.file))
  const engine = '0.1.54-next.6bab8fcc'
  const installedEngine = new URL('node_modules/@wildshard/engine/', cwd)
  await mkdir(installedEngine, { recursive: true })
  await writeFile(
    new URL('package.json', installedEngine),
    JSON.stringify({ name: '@wildshard/engine', version: engine }),
  )

  const result = await cli(
    run,
    [...PROVENANCE, '--channel', 'staging'],
    fileURLToPath(cwd),
  )

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(run.server.state.commits, [
    {
      contentEncoding: 'br',
      shardVersion: VERSION,
      version: VERSION,
      commit: COMMIT,
      channel: 'staging',
      sharddev: await readVersion(),
      engine,
      shardFormat: await installed('@wildshard/format'),
    },
  ])
})

test('any other --channel refuses and makes no request', async (context: TestContext): Promise<void> => {
  const run = await open(context)

  const channels = ['production', 'preview', 'live', '']
  const results = await Promise.all(
    channels.map(
      async (channel: string): Promise<CliRun> =>
        await cli(run, [...PROVENANCE, '--channel', channel]),
    ),
  )

  for (const result of results) {
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /--channel staging.*--channel prod/u)
  }
  assert.equal(run.server.state.apiRequests.length, 0)
})

// QA 11-13 row 2 (J198, J259): a draft as `wildshard build` writes it (sdk
// 0.2) refuses before any request, with its rule, fix and guide; api-server
// would answer it 422 only after the whole file was sent.
test('an unprepared draft refuses with its rule and makes no request', async (context: TestContext): Promise<void> => {
  const run = await open(
    context,
    await makeShardfile({ slug: 'upload-test', draft: true }),
  )

  const result = await cli(run, [...PROVENANCE, '--channel', 'staging'])

  assert.equal(result.status, 3, result.stderr)
  assert.match(
    result.stderr,
    /^sharddev: upload failed: upload-test is an unprepared draft \(no preparation\)/mu,
  )
  assert.match(
    result.stderr,
    /^ {2}\[shardfile-draft\] fix: Run `wildshard prepare <folder>`, then `wildshard build <folder>`.*\(GUIDE\.md#shardfile-draft\)$/mu,
  )
  assert.equal(run.server.state.apiRequests.length, 0)
  assert.deepEqual(run.server.state.puts, [])
})

test('--no-place reaches the commit as place: false (SA32)', async (context: TestContext): Promise<void> => {
  const run = await open(context)

  const result = await cli(run, [
    ...PROVENANCE,
    '--channel',
    'staging',
    '--no-place',
  ])

  assert.equal(result.status, 0, result.stderr)
  const [body] = run.server.state.commits
  assert.ok(typeof body === 'object' && body !== null && 'place' in body)
  assert.equal(body.place, false)
  assert.match(result.stdout, /^not placed \(--no-place\)$/mu)
})

for (const flag of ['--no-new', '--new']) {
  test(`${flag} reaches the upload commit`, async (context: TestContext): Promise<void> => {
    const run = await open(context)
    const result = await cli(run, [...PROVENANCE, '--channel', 'staging', flag])
    assert.equal(result.status, 0, result.stderr)
    const [body] = run.server.state.commits
    assert.ok(typeof body === 'object' && body !== null && 'new' in body)
    assert.equal(body.new, flag === '--new')
    assert.equal(
      result.stdout.includes('not listed in New (--no-new)'),
      flag === '--no-new',
    )
  })
}

test('upload help shows the sticky New flags and a conflicting choice refuses locally', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  const help = await cli(run, ['--help'])
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /\[--no-new\|--new\]/u)
  assert.match(help.stdout, /upload keeps the shard's current setting/u)
  const both = await cli(run, [
    ...PROVENANCE,
    '--channel',
    'staging',
    '--new',
    '--no-new',
  ])
  assert.notEqual(both.status, 0)
  assert.match(both.stderr, /choose one of --new or --no-new/u)
  assert.equal(run.server.state.apiRequests.length, 0)
})

async function versionInArchive(file: string): Promise<void> {
  const { readTar, writeTar } = await import('@wildshard/format/tar')
  const files = new Map(readTar(await readFile(file)))
  const header = files.get('shard.json')
  assert.ok(header)
  const index: unknown = JSON.parse(new TextDecoder().decode(header))
  assert.ok(typeof index === 'object' && index !== null)
  files.set(
    'shard.json',
    new TextEncoder().encode(
      JSON.stringify({ ...index, shardVersion: '2.3.4' }),
    ),
  )
  await writeFile(file, writeTar(files))
}

test('upload refuses a version that differs from the package and shard versions', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  await versionInArchive(run.file)
  const directory = fileURLToPath(new URL('.', pathToFileURL(run.file)))
  await writeFile(
    new URL('package.json', pathToFileURL(run.file)),
    '{"version":"2.3.4"}',
  )

  const result = await cli(
    run,
    ['--shard-version', '2.3.5', '--commit', COMMIT, '--channel', 'staging'],
    directory,
  )

  assert.equal(result.status, 3, result.stderr)
  assert.match(
    result.stderr,
    /package\.json version=2\.3\.4, shard\.json shardVersion=2\.3\.4, upload shardVersion=2\.3\.5/u,
  )
  assert.equal(run.server.state.apiRequests.length, 0)
})
