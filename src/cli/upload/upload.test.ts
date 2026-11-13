import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { brotliDecompressSync } from 'node:zlib'

import { refusalNote } from '../../sharddev/refusals.ts'
import { sha256 } from '../../test/helpers/shardfile.ts'
import {
  BUILT_WITH,
  COMMIT,
  TARBALL,
  VERSION,
  onlyPut,
  open,
  upload,
} from '../../test/helpers/upload-run.ts'
import { validateShardfile } from './validate.ts'

// The whole client against a real HTTP double: real Brotli, real Ed25519,
// the real validator. The bytes are the fixture product re-stamped.
// upload-cli.test.ts drives the same double through the real CLI.

const BYPASS_HEADER = 'x-vercel-protection-bypass'
// The grid line and the two links a staging upload prints last (SA32).
const AFTER_COMMIT = 4

test('compresses, signs, uploads and prints the revision', async (context: TestContext): Promise<void> => {
  const run = await open(context)

  const outcome = await upload(run)

  assert.deepEqual(outcome, {
    hash: sha256(TARBALL),
    shard: 'upload-test',
    revision: 1,
    alreadyStored: false,
    version: VERSION,
    formatVersion: '0.1',
    migrations: [],
    gridReport: [
      "no new cell: grid placement is off on the API, or this is not the shard's first upload",
      'preview: https://preview.wildshard.io/slug/upload-test (page not built yet)',
      'staging: https://staging.wildshard.io/slug/upload-test (page not built yet)',
    ],
  })
  assert.match(
    run.lines.at(-AFTER_COMMIT) ?? '',
    /^committed: upload-test 0\.0\.3 catalogue number 1 /u,
  )
})

test('sends the version and commit in the commit body (AC16, V1)', async (context: TestContext): Promise<void> => {
  const run = await open(context)

  await upload(run)

  assert.deepEqual(run.server.state.commits, [
    {
      contentEncoding: 'br',
      version: VERSION,
      commit: COMMIT,
      channel: 'staging',
      ...BUILT_WITH,
    },
  ])
})

test("prints the API's version, formatVersion and migrations", async (context: TestContext): Promise<void> => {
  const run = await open(context)

  await upload(run)

  assert.ok(
    run.lines.includes('api: version 0.0.3, formatVersion 0.1, migrations []'),
    run.lines.join('\n'),
  )
})

test('stored bytes under another version are refused, not stored', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  await upload(run)

  await assert.rejects(
    upload(run, undefined, '0.0.4'),
    /commit answered 409: these bytes are already upload-test 0\.0\.3/u,
  )
  onlyPut(run)
})

test("puts the tarball's Brotli under exactly the signed headers", async (context: TestContext): Promise<void> => {
  const run = await open(context)

  await upload(run)

  const { bytes, headers } = onlyPut(run)
  assert.equal(headers['content-encoding'], 'br')
  assert.equal(headers['content-type'], 'application/x-tar')
  assert.equal(headers['content-length'], String(bytes.length))
  assert.deepEqual(brotliDecompressSync(bytes), Buffer.from(TARBALL))
})

test("sends Vercel's bypass to the API and never to R2", async (context: TestContext): Promise<void> => {
  const run = await open(context)

  await upload(run, 'bypass')

  const { apiRequests } = run.server.state
  assert.equal(apiRequests.length, 4)
  for (const request of apiRequests) {
    assert.equal(request.headers[BYPASS_HEADER], 'bypass')
  }
  assert.equal(onlyPut(run).headers[BYPASS_HEADER], undefined)
})

test('sends nothing when the bytes are already stored', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  await upload(run)

  const outcome = await upload(run)

  assert.equal(outcome.alreadyStored, true)
  assert.equal(outcome.revision, 1)
  assert.equal(outcome.version, VERSION)
  onlyPut(run)
  assert.match(
    run.lines.at(-AFTER_COMMIT) ?? '',
    /^already stored: upload-test 0\.0\.3 /u,
  )
})

test('held bytes the listing misses still commit, and send nothing', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  await upload(run)
  run.server.state.unlisted = true

  const outcome = await upload(run)

  assert.equal(outcome.alreadyStored, true)
  onlyPut(run)
  assert.deepEqual(run.server.state.commits.at(-1), {
    contentEncoding: 'br',
    version: VERSION,
    commit: COMMIT,
    channel: 'staging',
    ...BUILT_WITH,
  })
  await assert.rejects(
    upload(run, undefined, '0.0.4'),
    /commit answered 409: these bytes are already upload-test 0\.0\.3/u,
  )
})

test('retries a PUT the store answered 5xx', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.failPuts = 2

  const outcome = await upload(run)

  assert.equal(outcome.revision, 1)
  onlyPut(run)
})

test('gives up on a PUT that keeps failing', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.failPuts = 3

  await assert.rejects(upload(run), /the PUT to R2 failed: 503: slow down/u)
})

test("reports the server's refusal", async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.refuseCommit = 'invalid shardfile: no shard.json'

  await assert.rejects(
    upload(run),
    /commit answered 422: invalid shardfile: no shard\.json/u,
  )
})

test('names the bypass when Vercel answers instead of api-server', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.sso = true

  await assert.rejects(
    upload(run),
    /answered 401: .*VERCEL_AUTOMATION_BYPASS_SECRET/u,
  )
})

test('refuses an invalid shardfile before any request', async (context: TestContext): Promise<void> => {
  const run = await open(context, TARBALL.subarray(0, 2048))

  await assert.rejects(upload(run), /tar: /u)
  assert.equal(run.server.state.apiRequests.length, 0)
})

test('reports the channel and the versions sent', async (context: TestContext): Promise<void> => {
  const run = await open(context)

  await upload(run)

  assert.ok(
    run.lines.includes(
      'sent: channel staging, sharddev 0.2.2, engine 0.1.13, shardFormat 0.4.4',
    ),
    run.lines.join('\n'),
  )
  assert.match(
    run.lines.at(-AFTER_COMMIT) ?? '',
    /^committed: upload-test 0\.0\.3 catalogue number 1 for staging /u,
  )
})

test('reads the channel and versions the API echoes (UP2)', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.echo = true

  await upload(run)

  assert.ok(
    run.lines.includes(
      'api: version 0.0.3, formatVersion 0.1, migrations [], channel staging, sharddev 0.2.2, engine 0.1.13, shardFormat 0.4.4',
    ),
    run.lines.join('\n'),
  )
})

// UP3's hero pre-check (J306, UP4 choice 4): the digest of the three card
// images' blob hashes, against the slug's newest catalogued version.

async function heroDigest(): Promise<string> {
  const { card } = await validateShardfile(TARBALL)
  assert.ok(card)
  return createHash('sha256')
    .update(
      `thumb:${card.thumb}\nportrait:${card.portrait}\nlandscape:${card.landscape}`,
    )
    .digest('hex')
}

test('an unchanged hero refuses before the PUT and names wildshard hero', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.catalogue.push({
    slug: 'upload-test',
    version: '0.0.2',
    heroHash: await heroDigest(),
  })

  await assert.rejects(upload(run), (error: unknown): boolean => {
    assert.ok(error instanceof Error)
    assert.match(
      error.message,
      /the hero is unchanged since upload-test 0\.0\.2: run wildshard hero/u,
    )
    assert.equal(refusalNote('upload', error.message).rule, 'hero-unchanged')
    return true
  })
  assert.equal(run.server.state.puts.length, 0)
  assert.equal(run.server.state.commits.length, 0)
})

test('a new hero, or none on record, passes the pre-check', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.catalogue.push(
    { slug: 'upload-test', version: '0.0.2', heroHash: 'f'.repeat(64) },
    { slug: 'other', version: '0.0.2', heroHash: await heroDigest() },
  )

  const outcome = await upload(run)

  assert.equal(outcome.revision, 1)
  onlyPut(run)
})

test('a retry of the catalogued version is not re-checked', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  await upload(run)
  run.server.state.catalogue.push({
    slug: 'upload-test',
    version: VERSION,
    heroHash: await heroDigest(),
  })

  const outcome = await upload(run)

  assert.equal(outcome.alreadyStored, true)
})
