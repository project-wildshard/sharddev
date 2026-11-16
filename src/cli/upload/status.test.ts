import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ApiRefusalError } from './api.ts'
import { waitForUpload } from './status.ts'

import type { PollPorts } from './status.ts'
import type { UploadState, UploadStatus } from './wire.ts'

const OPTIONS = { server: 'https://api.example.test', apiKey: 'wsk_fixture' }
const ID = 'upload-fixture'
const HASH = 'a'.repeat(64)
const BASE = { uploadId: ID, hash: HASH, createdAt: 1, updatedAt: 2 }

function clocked(
  sequence: readonly (UploadStatus | Readonly<Error>)[],
): Readonly<{
  ports: PollPorts
  delays: readonly number[]
  lines: readonly string[]
  report: (line: string) => void
}> {
  const clock = { now: 0, at: 0 }
  const delays: number[] = [],
    lines: string[] = []
  return {
    delays,
    lines,
    report: (line: string): void => {
      lines.push(line)
    },
    ports: {
      now: (): number => clock.now,
      sleep: async (milliseconds: number): Promise<void> => {
        delays.push(milliseconds)
        clock.now += milliseconds
        await Promise.resolve()
      },
      read: async (): Promise<UploadStatus> => {
        const next = sequence[Math.min(clock.at, sequence.length - 1)]
        clock.at += 1
        if (next === undefined) {
          throw new Error('empty fixture')
        }
        if (!('uploadId' in next)) {
          assert.ok(next instanceof Error)
          throw next
        }
        return await Promise.resolve(next)
      },
    },
  }
}

function statusOf(status: UploadState): UploadStatus {
  return { ...BASE, status }
}

test('SP21 polls cooking/staged/live with 2s backoff, capped at15s, reporting state changes once', async (): Promise<void> => {
  const fixture = clocked(
    (['cooking', 'cooking', 'staged', 'staged', 'live'] as const).map(
      (state: UploadState): UploadStatus => statusOf(state),
    ),
  )
  const result = await waitForUpload(
    OPTIONS,
    { id: ID, hash: HASH, report: fixture.report },
    fixture.ports,
  )
  assert.equal(result.status, 'live')
  assert.deepEqual(fixture.delays, [2000, 4000, 8000, 15_000])
  assert.deepEqual(fixture.lines, [
    `upload ${ID}: cooking`,
    `upload ${ID}: staged`,
    `upload ${ID}: live`,
  ])
})

test('SP21 a refusal prints the unchanged report and fails immediately', async (): Promise<void> => {
  const report = {
    failures: [{ path: 'entryways', detail: { cell: [1, -2] } }],
  }
  const fixture = clocked([{ ...BASE, status: 'refused', report }])
  await assert.rejects(
    waitForUpload(
      OPTIONS,
      { id: ID, hash: HASH, report: fixture.report },
      fixture.ports,
    ),
    /refused/u,
  )
  assert.deepEqual(fixture.lines, [
    `upload ${ID}: refused`,
    JSON.stringify(report, undefined, 2),
  ])
  assert.deepEqual(fixture.delays, [])
})

test('SP21 a stalled upload exits without waiting again', async (): Promise<void> => {
  const fixture = clocked([{ ...BASE, status: 'stalled' }])
  await assert.rejects(
    waitForUpload(
      OPTIONS,
      { id: ID, hash: HASH, report: fixture.report },
      fixture.ports,
    ),
    /stalled/u,
  )
  assert.deepEqual(fixture.delays, [])
})

test('SP21 a20-minute timeout keeps the upload id for a later status read', async (): Promise<void> => {
  const fixture = clocked([{ ...BASE, status: 'cooking' }])
  await assert.rejects(
    waitForUpload(
      OPTIONS,
      { id: ID, hash: HASH, report: fixture.report },
      fixture.ports,
    ),
    /timed out.*upload status upload-fixture/u,
  )
  assert.equal(
    fixture.delays.reduce(
      (sum: number, delay: number): number => sum + delay,
      0,
    ),
    1_200_000,
  )
  assert.ok(fixture.delays.every((delay: number): boolean => delay <= 15_000))
})

test('SP21 retries transient reads but does not hide an account refusal', async (): Promise<void> => {
  const fixture = clocked([
    new TypeError('network'),
    new ApiRefusalError('busy', 503),
    { ...BASE, status: 'live' },
  ])
  const live = await waitForUpload(
    OPTIONS,
    { id: ID, hash: HASH, report: fixture.report },
    fixture.ports,
  )
  assert.equal(live.status, 'live')
  assert.deepEqual(fixture.delays, [2000, 4000])
  const denied = clocked([new ApiRefusalError('no key', 401)])
  await assert.rejects(
    waitForUpload(
      OPTIONS,
      { id: ID, hash: HASH, report: denied.report },
      denied.ports,
    ),
    /no key/u,
  )
  assert.deepEqual(denied.delays, [])
})

test('SP21 rejects a status bound to another hash', async (): Promise<void> => {
  const fixture = clocked([{ ...BASE, hash: 'b'.repeat(64), status: 'live' }])
  await assert.rejects(
    waitForUpload(
      OPTIONS,
      { id: ID, hash: HASH, report: fixture.report },
      fixture.ports,
    ),
    /does not match/u,
  )
})

test('SP21 a single timed-out read retries within the overall verdict deadline', async (): Promise<void> => {
  const fixture = clocked([
    new DOMException('request timed out', 'TimeoutError'),
    new DOMException('body read aborted by request timeout', 'AbortError'),
    { ...BASE, status: 'live' },
  ])
  const result = await waitForUpload(
    OPTIONS,
    { id: ID, hash: HASH, report: fixture.report },
    fixture.ports,
  )
  assert.equal(result.status, 'live')
  assert.deepEqual(fixture.delays, [2000, 4000])
})

test('SP21 a late authorization refusal retains its real cause', async (): Promise<void> => {
  const clock = { expired: false }
  const fixture = clocked([])
  const ports: PollPorts = {
    ...fixture.ports,
    now: (): number => (clock.expired ? 1_200_001 : 0),
    read: async (): Promise<UploadStatus> => {
      clock.expired = true
      await Promise.resolve()
      throw new ApiRefusalError('no account key', 401)
    },
  }
  await assert.rejects(
    waitForUpload(
      OPTIONS,
      { id: ID, hash: HASH, report: fixture.report },
      ports,
    ),
    /no account key/u,
  )
  assert.deepEqual(fixture.delays, [])
})
