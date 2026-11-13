// oxlint-disable typescript/prefer-readonly-parameter-types -- a run collects what the double saw
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { text } from 'node:stream/consumers'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'

import { makeShardfile } from '../../test/helpers/shardfile.ts'
import { COMMIT, VERSION, open } from '../../test/helpers/upload-run.ts'
import { readVersion } from '../version.ts'

import type { Run } from '../../test/helpers/upload-run.ts'

const MAIN = fileURLToPath(new URL('../main.ts', import.meta.url))
const ROOT = new URL('../../../', import.meta.url)

// UP3 (J301, J306): the channel the upload is for, and the versions it was
// built with, through the real CLI against the double.

interface CliRun {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

async function cli(run: Run, args: readonly string[]): Promise<CliRun> {
  const child = spawn(
    process.execPath,
    [MAIN, 'upload', run.file, '--server', run.server.url, ...args],
    {
      cwd: fileURLToPath(ROOT),
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

const PROVENANCE = ['--version', VERSION, '--commit', COMMIT]

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
    /^sharddev: upload failed: upload-test is an unprepared draft \(sdk 0\.2\)/mu,
  )
  assert.match(
    result.stderr,
    /^ {2}\[shardfile-draft\] fix: Run `wildshard prepare <folder> --base <url>`, then `wildshard build <folder>`.*\(GUIDE\.md#shardfile-draft\)$/mu,
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
