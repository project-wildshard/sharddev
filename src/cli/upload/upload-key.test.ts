// oxlint-disable typescript/prefer-readonly-parameter-types -- a run collects what the double saw
import assert from 'node:assert/strict'
import type { IncomingMessage } from 'node:http'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import { runCli, scratchHome } from '../../test/helpers/cli-run.ts'
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
import { uploadShardfile } from './upload.ts'

import type { CliRun } from '../../test/helpers/cli-run.ts'
import type { Run } from '../../test/helpers/upload-run.ts'

// Meta SHARD-DELETE DEL6: since DEL5 api-server answers a ticket or a commit
// with no account key 401. The key goes on exactly those two calls (never
// on the public reads, never to R2), and with no key upload refuses before
// any request and names `wildshard account`.

/** A request to the double as its method and path, and the key it carried. */
function callOf(
  request: IncomingMessage,
): readonly [string, string | undefined] {
  return [
    `${request.method ?? ''} ${request.url ?? ''}`,
    request.headers.authorization,
  ]
}

async function cliUpload(
  run: Run,
  keys: Readonly<Record<string, string>>,
): Promise<CliRun> {
  const args = [
    'upload',
    run.file,
    '--server',
    run.server.url,
    '--channel',
    'staging',
  ]
  return await runCli([...args, '--version', VERSION, '--commit', COMMIT], {
    WILDSHARD_CREATOR_PRIVATE_KEY: run.server.privateKey,
    ...keys,
  })
}

test('sends the account key on the ticket and the commit only', async (context: TestContext): Promise<void> => {
  const run = await open(context)

  await upload(run)

  const bearer = `Bearer ${run.server.apiKey}`
  assert.deepEqual(run.server.state.apiRequests.map(callOf), [
    ['GET /api/catalogue', undefined],
    ['GET /api/shardfiles', undefined],
    ['POST /api/shardfiles/uploads', bearer],
    [`POST /api/shardfiles/uploads/${sha256(TARBALL)}/commit`, bearer],
  ])
  assert.equal(onlyPut(run).headers['authorization'], undefined)
})

test('a key the API does not know is refused at the ticket', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  const options = {
    file: run.file,
    server: run.server.url,
    privateKey: run.server.privateKey,
    level: 5,
  }

  const sent = uploadShardfile({
    ...options,
    apiKey: 'wsk_not-this-one',
    version: VERSION,
    commit: COMMIT,
    channel: 'staging',
    ...BUILT_WITH,
    report: (): void => undefined,
  })

  await assert.rejects(
    sent,
    /\/api\/shardfiles\/uploads answered 401: an account key is required/u,
  )
  assert.deepEqual(run.server.state.puts, [])
})

test('no account key refuses, names wildshard account and makes no request', async (context: TestContext): Promise<void> => {
  const run = await open(context)

  const result = await cliUpload(run, { HOME: await scratchHome(context) })

  assert.equal(result.status, 1, result.stderr)
  assert.match(
    result.stderr,
    /^sharddev: upload needs an account key: run wildshard account <email>, or set WILDSHARD_API_KEY$/mu,
  )
  assert.match(
    result.stderr,
    /^ {2}\[account-key-missing\] fix: Run `wildshard account <email>` once.*\(GUIDE\.md#account-key-missing\)$/mu,
  )
  assert.equal(run.server.state.apiRequests.length, 0)
})

test('the key file is sent when WILDSHARD_API_KEY is unset', async (context: TestContext): Promise<void> => {
  const run = await open(context)

  const result = await cliUpload(run, {
    HOME: await scratchHome(context, run.server.apiKey),
  })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(run.server.state.revisions.size, 1)
})

test('WILDSHARD_API_KEY wins over the key file', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  const home = await scratchHome(context, 'wsk_an-old-key')

  const result = await cliUpload(run, {
    HOME: home,
    WILDSHARD_API_KEY: run.server.apiKey,
  })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(run.server.state.revisions.size, 1)
})

test('upload sends the key only over https or to localhost', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  const args = [
    'upload',
    run.file,
    '--server',
    'http://api.example.com',
    '--channel',
    'staging',
  ]

  const result = await runCli(
    [...args, '--version', VERSION, '--commit', COMMIT],
    {
      WILDSHARD_CREATOR_PRIVATE_KEY: run.server.privateKey,
      WILDSHARD_API_KEY: run.server.apiKey,
    },
  )

  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stderr, /the account key goes only to an https server/u)
})
