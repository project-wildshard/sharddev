// oxlint-disable typescript/prefer-readonly-parameter-types -- a run collects what the double saw
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { brotliDecompressSync } from 'node:zlib'

import { makeShardfile, sha256 } from '../../test/helpers/shardfile.ts'
import { openUploadServer } from '../../test/helpers/upload-server.ts'
import { uploadShardfile } from './upload.ts'

import type { UploadServer } from '../../test/helpers/upload-server.ts'
import type { UploadOutcome } from './upload.ts'

// The whole client against a real HTTP double: real Brotli, real Ed25519,
// the real validator. The bytes are the fixture product re-stamped.

const TARBALL = await makeShardfile({ slug: 'upload-test' })
const BYPASS_HEADER = 'x-vercel-protection-bypass'
const VERSION = '0.0.3'
const COMMIT = 'c'.repeat(40)

interface Run {
  readonly server: UploadServer
  readonly file: string
  readonly lines: string[]
}

async function open(
  context: TestContext,
  tarball: Readonly<Uint8Array> = TARBALL,
): Promise<Run> {
  const directory = await mkdtemp(path.join(tmpdir(), 'sharddev-upload-'))
  context.after(async (): Promise<void> => {
    await rm(directory, { recursive: true })
  })
  const file = path.join(directory, 'shard.tar')
  await writeFile(file, tarball)
  return { server: await openUploadServer(context), file, lines: [] }
}

async function upload(
  run: Run,
  bypassSecret?: string,
  version: string = VERSION,
): Promise<UploadOutcome> {
  return await uploadShardfile({
    file: run.file,
    server: run.server.url,
    privateKey: run.server.privateKey,
    level: 5,
    version,
    commit: COMMIT,
    report: (line: string): void => {
      run.lines.push(line)
    },
    ...(bypassSecret === undefined ? {} : { bypassSecret }),
  })
}

function onlyPut(run: Run): UploadServer['state']['puts'][number] {
  const [put, ...rest] = run.server.state.puts
  assert.ok(put)
  assert.equal(rest.length, 0)
  return put
}

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
  })
  assert.match(
    run.lines.at(-1) ?? '',
    /^committed: upload-test 0\.0\.3 revision 1 /u,
  )
})

test('sends the version and commit in the commit body (AC16, V1)', async (context: TestContext): Promise<void> => {
  const run = await open(context)

  await upload(run)

  assert.deepEqual(run.server.state.commits, [
    { contentEncoding: 'br', version: VERSION, commit: COMMIT },
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
  assert.equal(apiRequests.length, 3)
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
  assert.match(run.lines.at(-1) ?? '', /^already stored: upload-test 0\.0\.3 /u)
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
