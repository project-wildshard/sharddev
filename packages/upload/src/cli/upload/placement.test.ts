import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import {
  BUILT_WITH,
  COMMIT,
  VERSION,
  open,
  upload,
  uploadWith,
} from '../../test/helpers/upload-run.ts'
import { placementLines } from './placement.ts'

// SA32 (J314 Q13): `--no-place` sends `place: false`, and the upload
// prints the API's grid answer (SA30) and each moved channel's link.

const LINKS = [
  'preview: https://preview.wildshard.io/slug/upload-test (page not built yet)',
  'staging: https://staging.wildshard.io/slug/upload-test (page not built yet)',
]

test('--no-place sends place: false; a default upload sends no place', async (context: TestContext): Promise<void> => {
  const run = await open(context)

  await uploadWith(run, { place: false })
  await upload(run)

  const [noPlace, retry] = run.server.state.commits
  assert.deepEqual(noPlace, {
    contentEncoding: 'br',
    version: VERSION,
    commit: COMMIT,
    channel: 'staging',
    ...BUILT_WITH,
    place: false,
  })
  assert.ok(typeof retry === 'object' && retry !== null)
  assert.equal('place' in retry, false)
})

test('a placed shard prints its cell and the links', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.grid = 'free'

  await upload(run)

  assert.deepEqual(run.lines.slice(-3), [
    'placed at (0,3) on preview, staging',
    ...LINKS,
  ])
})

test('a prod upload links all three channels', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.grid = 'free'

  await uploadWith(run, { channel: 'production' })

  assert.deepEqual(run.lines.slice(-4), [
    'placed at (0,3) on preview, staging, production',
    ...LINKS,
    'production: https://play.wildshard.io/slug/upload-test (page not built yet)',
  ])
})

test('a full grid prints grid full, not placed, and the links', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.grid = 'full'

  await upload(run)

  assert.deepEqual(run.lines.slice(-3), ['grid full, not placed', ...LINKS])
})

test('--no-place prints not placed (--no-place) and the links', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.grid = 'free'

  await uploadWith(run, { place: false })

  assert.deepEqual(run.lines.slice(-3), ['not placed (--no-place)', ...LINKS])
})

test('--no-place says so while placement is off too', async (context: TestContext): Promise<void> => {
  const run = await open(context)

  await uploadWith(run, { place: false })

  assert.deepEqual(run.lines.slice(-3), ['not placed (--no-place)', ...LINKS])
})

test('a cell taken on one channel names it', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.grid = 'taken'

  await upload(run)

  assert.equal(
    run.lines.at(-3),
    "placed at (0,3) on preview; not on staging's grid",
  )
})

test('a failed grid step says to run the same upload again', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.grid = 'failed'

  await upload(run)

  assert.deepEqual(run.lines.slice(-3), [
    'not placed: the grid step failed; run the same upload again to retry',
    ...LINKS,
  ])
})

test('a placement the CLI cannot read still uploads', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.grid = 'garbled'

  const outcome = await upload(run)

  assert.equal(outcome.revision, 1)
  assert.deepEqual(run.lines.slice(-3), [
    "grid: the API's placement answer was not understood",
    ...LINKS,
  ])
})

test('a revived shard links preview only', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.grid = 'revived'

  await upload(run)

  assert.deepEqual(run.lines.slice(-2), [
    "no new cell: grid placement is off on the API, or this is not the shard's first upload",
    'preview: https://preview.wildshard.io/slug/upload-test (page not built yet)',
  ])
})

test('--no-place past the first upload leaves a held cell alone', (): void => {
  const answer = {
    hash: 'a'.repeat(64),
    shard: 'upload-test',
    revision: 2,
    created: true,
    staged: false,
    notified: false,
    signedBy: 'test',
    bytes: 1,
    storedBytes: 1,
    version: '0.0.4',
    formatVersion: '0.1',
    migrations: [],
    placement: { placed: false, reason: 'not placed (place: false)' },
  }

  const lines = placementLines(answer, { channel: 'staging', place: false })

  assert.deepEqual(lines, ['grid left as it was (--no-place)', ...LINKS])
})
