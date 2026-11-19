// oxlint-disable typescript/prefer-readonly-parameter-types -- the fixture exposes scripted HTTP states
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'
import { text } from 'node:stream/consumers'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  COMMIT,
  VERSION,
  open,
  uploadWith,
} from '../../../../dev/src/test/helpers/upload-run.ts'
import { readUploadStatus } from './api.ts'

import type { Run } from '../../../../dev/src/test/helpers/upload-run.ts'

const MAIN = fileURLToPath(
  new URL('../../../../dev/src/cli/main.ts', import.meta.url),
)
const PROVENANCE = [
  '--version',
  VERSION,
  '--commit',
  COMMIT,
  '--channel',
  'staging',
]

test('SP21 an oversized authenticated HTTP status reply refuses before parsing', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.async.enabled = true
  const queued = await uploadWith(run, { wait: false })
  run.server.state.async.sequence = ['refused']
  run.server.state.async.report = 'x'.repeat(17 * 1024 * 1024)
  await assert.rejects(
    readUploadStatus(
      { server: run.server.url, apiKey: run.server.apiKey },
      queued.uploadId ?? 'missing',
    ),
    /status response exceeds the 16 MiB limit/u,
  )
})

async function cli(
  context: TestContext,
  run: Run,
  invocation: Readonly<{ args: readonly string[]; keyless?: boolean }>,
): Promise<
  Readonly<{ status: number | null; stdout: string; stderr: string }>
> {
  const child = spawn(
    process.execPath,
    [MAIN, 'upload', ...invocation.args, '--server', run.server.url],
    {
      env: {
        PATH: process.env['PATH'],
        HOME: path.dirname(run.file),
        ...(invocation.keyless === true
          ? {}
          : { WILDSHARD_API_KEY: run.server.apiKey }),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  context.after((): void => {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
    }
  })
  const stderr = text(child.stderr),
    stdout = text(child.stdout)
  await once(child, 'close')
  return { status: child.exitCode, stdout: await stdout, stderr: await stderr }
}

test(
  'SP21 the CLI waits through cooking and staged, then prints live and its placement',
  { timeout: 15_000 },
  async (context: TestContext): Promise<void> => {
    const run = await open(context)
    run.server.state.async.enabled = true
    run.server.state.async.sequence = ['staged', 'live']
    const done = await cli(context, run, { args: [run.file, ...PROVENANCE] })
    assert.equal(done.status, 0, done.stderr)
    assert.match(
      done.stdout,
      /checked:[\s\S]*: cooking[\s\S]*: staged[\s\S]*: live/u,
    )
    assert.match(
      done.stdout,
      /resume with wildshard upload status upload-[a-f0-9]+[\s\S]*: staged/u,
    )
    assert.match(done.stdout, /placed at \(0,3\)/u)
    assert.equal(run.server.state.async.reads.length, 2)
    assert.ok(
      run.server.state.async.reads.every(
        (request): boolean =>
          request.headers.authorization === `Bearer ${run.server.apiKey}`,
      ),
    )
  },
)

for (const status of ['refused', 'stalled'] as const) {
  test(
    `SP21 ${status} prints its verdict and exits non-zero`,
    { timeout: 10_000 },
    async (context: TestContext): Promise<void> => {
      const run = await open(context)
      run.server.state.async.enabled = true
      run.server.state.async.sequence = [status]
      const done = await cli(context, run, { args: [run.file, ...PROVENANCE] })
      assert.equal(done.status, 3)
      assert.match(done.stderr, new RegExp(status, 'u'))
      if (status === 'refused') {
        assert.match(done.stdout, /portal walk failed/u)
      }
      assert.equal(run.server.state.async.reads.length, 1)
    },
  )
}

test(
  'SP21 --no-wait prints the id without any status read',
  { timeout: 10_000 },
  async (context: TestContext): Promise<void> => {
    const run = await open(context)
    run.server.state.async.enabled = true
    run.server.state.async.sequence = ['refused']
    const done = await cli(context, run, {
      args: [run.file, ...PROVENANCE, '--no-wait'],
    })
    assert.equal(done.status, 0, done.stderr)
    assert.match(done.stdout, /queued:.*upload upload-[a-f0-9]+/u)
    assert.equal(run.server.state.async.reads.length, 0)
  },
)

test(
  'SP21 upload status reads an id without a shard file, provenance or channel',
  { timeout: 10_000 },
  async (context: TestContext): Promise<void> => {
    const run = await open(context)
    run.server.state.async.enabled = true
    const queued = await uploadWith(run, { wait: false })
    const commits = run.server.state.commits.length
    const done = await cli(context, run, {
      args: ['status', queued.uploadId ?? 'missing'],
    })
    assert.equal(done.status, 0, done.stderr)
    assert.match(done.stdout, /: live/u)
    assert.equal(run.server.state.commits.length, commits)
    assert.equal(run.server.state.async.reads.length, 1)
  },
)

test(
  'MU11 a keyless machine reads a known upload verdict without private fields',
  { timeout: 10_000 },
  async (context: TestContext): Promise<void> => {
    const run = await open(context)
    run.server.state.async.enabled = true
    const queued = await uploadWith(run, { wait: false })
    const id = queued.uploadId ?? 'missing'
    run.server.state.async.sequence = ['refused']
    const done = await cli(context, run, {
      args: ['status', id],
      keyless: true,
    })
    assert.deepEqual(
      [done.status, done.stdout.trim(), run.server.state.commits.length],
      [3, `upload ${id}: refused`, 1],
      done.stderr,
    )
    assert.match(done.stderr, /: refused/u)
    assert.deepEqual(
      run.server.state.async.reads.map(
        (request): readonly [string | undefined, string | undefined] => [
          request.url,
          request.headers.authorization,
        ],
      ),
      [[`/api/shardfiles/uploads/${id}/status`, undefined]],
    )
  },
)

test(
  'SP21 the status command rejects a response for another upload',
  { timeout: 10_000 },
  async (context: TestContext): Promise<void> => {
    const run = await open(context)
    run.server.state.async.enabled = true
    const queued = await uploadWith(run, { wait: false })
    run.server.state.async.replyId = 'another-upload'
    const done = await cli(context, run, {
      args: ['status', queued.uploadId ?? 'missing'],
    })
    assert.equal(done.status, 3)
    assert.match(done.stderr, /does not match the requested upload/u)
    assert.doesNotMatch(done.stdout, /: live/u)
  },
)
