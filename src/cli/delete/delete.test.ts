import assert from 'node:assert/strict'
import type { IncomingMessage } from 'node:http'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import { runCli, scratchHome } from '../../test/helpers/cli-run.ts'
import { openUploadServer } from '../../test/helpers/upload-server.ts'

import type { CliRun } from '../../test/helpers/cli-run.ts'
import type { UploadServer } from '../../test/helpers/upload-server.ts'

// Meta SHARD-DELETE DEL10: `wildshard delete <slug>` is start, the
// summary, the typed slug, then finalize, through the real CLI against
// the api-server double. A wrong typed slug finalizes nothing; an expired
// confirm token says how to start again; `--yes` skips the typing.

const SLUG = 'my-shard'

async function deleteRun(
  server: Readonly<{ url: string; apiKey: string }>,
  context: TestContext,
  run: Readonly<{ args?: readonly string[]; input?: string; key?: string }>,
): Promise<CliRun> {
  return await runCli(
    ['delete', ...(run.args ?? [SLUG]), '--server', server.url],
    {
      HOME: await scratchHome(context),
      WILDSHARD_API_KEY: run.key ?? server.apiKey,
    },
    run.input,
  )
}

async function ownedServer(context: TestContext): Promise<UploadServer> {
  const server = await openUploadServer(context)
  server.state.deletions.shards.add(SLUG)
  return server
}

/** The authorization header of each request the double saw. */
function authorizations(requests: readonly IncomingMessage[]): unknown[] {
  return requests.map(
    (request: IncomingMessage): unknown => request.headers.authorization,
  )
}

/** Start's summary, the prompt and finalize's line, in order. */
function assertDeleted(stdout: string): void {
  assert.match(
    stdout,
    /^delete my-shard: 2 versions \(0\.0\.1 aaaaaaaa, 0\.0\.2 bbbbbbbb\)$/mu,
  )
  assert.match(stdout, /^channels pointing at it: preview, staging$/mu)
  assert.match(stdout, /^live on staging until its next release/mu)
  assert.match(stdout, /type my-shard to delete it/u)
  assert.match(stdout, /^grid cells placing it: none$/mu)
  assert.match(stdout, /\ndeleted my-shard at [^\n]*\n$/u)
}

test('the typed slug finalizes, after the summary and its note', async (context: TestContext): Promise<void> => {
  const server = await ownedServer(context)
  server.state.deletions.note =
    'live on staging until its next release: a signed release keeps its copy'

  const result = await deleteRun(server, context, { input: `${SLUG}\n` })

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(server.state.deletions.finalized, [SLUG])
  assertDeleted(result.stdout)
  const bearer = `Bearer ${server.apiKey}`
  assert.deepEqual(authorizations(server.state.apiRequests), [bearer, bearer])
  assert.ok(!`${result.stdout}${result.stderr}`.includes(server.apiKey))
})

test('a wrong typed slug finalizes nothing', async (context: TestContext): Promise<void> => {
  const server = await ownedServer(context)

  const wrong = await deleteRun(server, context, { input: 'my-shar\n' })
  const none = await deleteRun(server, context, {})

  for (const result of [wrong, none]) {
    assert.equal(result.status, 1, result.stderr)
    assert.match(
      result.stderr,
      /not confirmed: .*nothing was deleted\n {2}\[delete-not-confirmed\] fix: .*\(GUIDE\.md#delete-not-confirmed\)$/mu,
    )
  }
  assert.match(wrong.stderr, /you typed "my-shar", not my-shard/u)
  assert.match(none.stderr, /you typed nothing/u)
  assert.deepEqual(server.state.deletions.starts, [SLUG, SLUG])
  assert.deepEqual(server.state.deletions.finalizeCalls, [])
})

test('--yes finalizes without asking', async (context: TestContext): Promise<void> => {
  const server = await ownedServer(context)

  const result = await deleteRun(server, context, { args: [SLUG, '--yes'] })

  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(result.stdout, /type my-shard/u)
  assert.deepEqual(server.state.deletions.finalized, [SLUG])
})

test('an expired confirm token prints how to start again', async (context: TestContext): Promise<void> => {
  const server = await ownedServer(context)
  server.state.deletions.expire = true

  const result = await deleteRun(server, context, { input: `${SLUG}\n` })

  assert.equal(result.status, 3, result.stderr)
  assert.match(
    result.stderr,
    /past its 10 minutes.*Nothing was deleted; start again with wildshard delete my-shard$/mu,
  )
  assert.match(
    result.stderr,
    /\[delete-expired\] fix: .*\(GUIDE\.md#delete-expired\)$/mu,
  )
  assert.deepEqual(server.state.deletions.finalized, [])
})

test("another account's key is refused at start, and nothing is asked", async (context: TestContext): Promise<void> => {
  const server = await ownedServer(context)

  const result = await deleteRun(server, context, {
    input: `${SLUG}\n`,
    key: 'wsk_stranger',
  })

  assert.equal(result.status, 3, result.stderr)
  assert.match(
    result.stderr,
    /start answered 403: my-shard belongs to another/u,
  )
  assert.match(result.stderr, /\[delete-not-owner\]/u)
  assert.doesNotMatch(result.stdout, /type my-shard/u)
  assert.deepEqual(server.state.deletions.finalizeCalls, [])
})

test('an unknown slug and a grid-placed slug name their rules', async (context: TestContext): Promise<void> => {
  const server = await ownedServer(context)
  server.state.deletions.shards.add('placed')
  server.state.deletions.placed.add('placed')

  const unknown = await deleteRun(server, context, { args: ['nope', '--yes'] })
  const placed = await deleteRun(server, context, { args: ['placed', '--yes'] })

  assert.deepEqual([unknown.status, placed.status], [3, 3])
  assert.match(
    unknown.stderr,
    /start answered 404: no shard nope\n {2}\[delete-unknown\]/u,
  )
  assert.match(placed.stderr, /the grid places it.*\n {2}\[delete-placed\]/u)
  assert.deepEqual(server.state.deletions.finalizeCalls, [])
})

test('no slug, no server or no key refuses before any request', async (context: TestContext): Promise<void> => {
  const server = await ownedServer(context)
  const home = await scratchHome(context)

  const noSlug = await runCli(['delete', '--server', server.url], {
    HOME: home,
    WILDSHARD_API_KEY: server.apiKey,
  })
  const noServer = await runCli(['delete', SLUG], {
    HOME: home,
    WILDSHARD_API_KEY: server.apiKey,
  })
  const noKey = await runCli(['delete', SLUG, '--server', server.url], {
    HOME: home,
  })

  assert.deepEqual([noSlug.status, noServer.status, noKey.status], [1, 1, 1])
  assert.match(
    noSlug.stderr,
    /usage: wildshard delete <slug>.*\n {2}\[usage\]/u,
  )
  assert.match(noServer.stderr, /or set WILDSHARD_API_URL/u)
  assert.match(
    noKey.stderr,
    /delete needs an account key.*\n {2}\[account-key-missing\]/u,
  )
  assert.equal(server.state.apiRequests.length, 0)
})

test('a slug that is not a slug refuses before any request', async (context: TestContext): Promise<void> => {
  const server = await ownedServer(context)

  const result = await deleteRun(server, context, { args: ['..', '--yes'] })

  assert.equal(result.status, 1, result.stderr)
  assert.match(
    result.stderr,
    /a slug is a lower-case letter.*not \.\.\n {2}\[usage\]/u,
  )
  assert.equal(server.state.apiRequests.length, 0)
})
