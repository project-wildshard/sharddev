import assert from 'node:assert/strict'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import { keyFileIn, runCli, scratchHome } from '../../test/helpers/cli-run.ts'
import { openUploadServer } from '../../test/helpers/upload-server.ts'

import type { CliRun } from '../../test/helpers/cli-run.ts'

// Meta SHARD-DELETE DEL6: `wildshard account <email>` makes the account
// (DEL4's one call) and keeps its key in ~/.config/wildshard/sharddev-key,
// mode 600; `wildshard whoami` says which key upload would send and, from
// `GET /api/accounts/me`, its account's email and slug count. Through
// the real CLI against the double, each run with a scratch HOME.

const EMAIL = 'author@example.com'
const OCTAL = 8
const PERMISSION_DIGITS = -3

async function account(
  server: Readonly<{ url: string }>,
  home: string,
  args: readonly string[],
): Promise<CliRun> {
  return await runCli(['account', ...args, '--server', server.url], {
    HOME: home,
  })
}

/** The file's permission bits as `ls` writes them in octal: `600`. */
async function permissions(file: string): Promise<string> {
  const stats = await stat(file)
  return stats.mode.toString(OCTAL).slice(PERMISSION_DIGITS)
}

test('account saves the key the API answers, mode 600, and never prints it', async (context: TestContext): Promise<void> => {
  const server = await openUploadServer(context)
  const home = await scratchHome(context)

  const result = await account(server, home, ['Author@Example.com'])

  assert.equal(result.status, 0, result.stderr)
  const key = server.state.accounts.byEmail.get(EMAIL) ?? 'none'
  assert.equal(await readFile(keyFileIn(home), 'utf8'), `${key}\n`)
  assert.equal(await permissions(keyFileIn(home)), '600')
  assert.match(
    result.stdout,
    /^account author@example\.com: key wsk_\S{4}… saved to /mu,
  )
  assert.ok(!`${result.stdout}${result.stderr}`.includes(key))
})

test('a 409 says the email already has an account and writes nothing', async (context: TestContext): Promise<void> => {
  const server = await openUploadServer(context)
  await account(server, await scratchHome(context), [EMAIL])
  const home = await scratchHome(context)

  const result = await account(server, home, ['AUTHOR@example.com'])

  assert.equal(result.status, 3, result.stderr)
  assert.match(
    result.stderr,
    /^sharddev: account failed: AUTHOR@example\.com already has an account; .*a lost key needs an operator reset$/mu,
  )
  assert.match(
    result.stderr,
    /^ {2}\[account-exists\] fix: .*\(GUIDE\.md#account-exists\)$/mu,
  )
  await assert.rejects(readFile(keyFileIn(home)), { code: 'ENOENT' })
})

test('a saved key is never replaced without --force, and no account is made', async (context: TestContext): Promise<void> => {
  const server = await openUploadServer(context)
  const home = await scratchHome(context, 'wsk_kept')

  const refused = await account(server, home, [EMAIL])

  assert.equal(refused.status, 3, refused.stderr)
  assert.match(
    refused.stderr,
    /already holds a key; pass --force.*\n {2}\[account-key-file\]/u,
  )
  assert.equal(server.state.apiRequests.length, 0)
  assert.equal(await readFile(keyFileIn(home), 'utf8'), 'wsk_kept\n')
})

test("--force replaces a saved key with the new account's", async (context: TestContext): Promise<void> => {
  const server = await openUploadServer(context)
  const home = await scratchHome(context, 'wsk_kept')

  const forced = await account(server, home, [EMAIL, '--force'])

  assert.equal(forced.status, 0, forced.stderr)
  const key = server.state.accounts.byEmail.get(EMAIL) ?? 'none'
  assert.equal(await readFile(keyFileIn(home), 'utf8'), `${key}\n`)
  assert.equal(await permissions(keyFileIn(home)), '600')
})

test('account without an email or a server refuses before any request', async (context: TestContext): Promise<void> => {
  const home = await scratchHome(context)

  const noEmail = await runCli(['account', '--server', 'http://127.0.0.1:9'], {
    HOME: home,
  })
  const noServer = await runCli(['account', EMAIL], { HOME: home })

  assert.equal(noEmail.status, 1, noEmail.stderr)
  assert.match(
    noEmail.stderr,
    /usage: wildshard account <email>.*\n {2}\[usage\]/u,
  )
  assert.equal(noServer.status, 1, noServer.stderr)
  assert.match(
    noServer.stderr,
    /usage: wildshard account <email> --server <url> \(or set WILDSHARD_API_URL\)/u,
  )
})

test('whoami with no server names where the key comes from and shows only its start', async (context: TestContext): Promise<void> => {
  const key = `wsk_${'a1'.repeat(32)}`
  const home = await scratchHome(context, key)

  const fromFile = await runCli(['whoami'], { HOME: home })
  const fromEnv = await runCli(['whoami'], {
    HOME: home,
    WILDSHARD_API_KEY: 'wsk_b2b2b2b2b2b2',
  })

  assert.equal(fromFile.status, 0, fromFile.stderr)
  assert.match(
    fromFile.stdout,
    new RegExp(`^key wsk_a1a1… from ${keyFileIn(home)}$`, 'mu'),
  )
  assert.match(fromFile.stdout, /^no server \(pass --server <url>/mu)
  assert.ok(!fromFile.stdout.includes(key))
  assert.match(fromEnv.stdout, /^key wsk_b2b2… from WILDSHARD_API_KEY$/mu)
})

test('whoami asks the API and prints the email and the slugs the key owns', async (context: TestContext): Promise<void> => {
  const server = await openUploadServer(context)
  const { apiKey } = server.state.accounts
  const home = await scratchHome(context)
  await account(server, home, [EMAIL])

  const own = await runCli(['whoami', '--server', server.url], {
    HOME: home,
    WILDSHARD_API_KEY: apiKey,
  })
  const made = await runCli(['whoami'], {
    HOME: home,
    WILDSHARD_API_URL: server.url,
  })

  assert.deepEqual(
    [own.status, made.status, `${own.stdout}${own.stderr}`.includes(apiKey)],
    [0, 0, false],
  )
  assert.match(
    own.stdout,
    /^key wsk_\S{4}… from WILDSHARD_API_KEY\naccount owner@example\.com owns 2 slugs \(and 1 deleted\)$/mu,
  )
  assert.match(made.stdout, /^account author@example\.com owns 0 slugs$/mu)
})

test('whoami against an older API without the route keeps the key line', async (context: TestContext): Promise<void> => {
  const server = await openUploadServer(context)
  server.state.accounts.me = undefined

  const result = await runCli(['whoami', '--server', server.url], {
    HOME: await scratchHome(context),
    WILDSHARD_API_KEY: server.state.accounts.apiKey,
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^key wsk_\S{4}… from WILDSHARD_API_KEY$/mu)
  assert.match(
    result.stdout,
    /has no \/api\/accounts\/me \(not api-server, or older than v0\.12\.0\)/u,
  )
})

test('whoami with a key the API does not know is refused, never echoing it', async (context: TestContext): Promise<void> => {
  const server = await openUploadServer(context)
  const stranger = 'wsk_c3c3c3c3c3c3c3c3'

  const result = await runCli(['whoami', '--server', server.url], {
    HOME: await scratchHome(context),
    WILDSHARD_API_KEY: stranger,
  })

  assert.equal(result.status, 3, result.stderr)
  assert.match(result.stdout, /^key wsk_c3c3… from WILDSHARD_API_KEY$/mu)
  assert.match(result.stderr, /does not know this key \(401\)/u)
  assert.ok(!`${result.stdout}${result.stderr}`.includes(stranger))
})

test('whoami with no key names wildshard account', async (context: TestContext): Promise<void> => {
  const result = await runCli(['whoami'], { HOME: await scratchHome(context) })

  assert.equal(result.status, 3, result.stderr)
  assert.match(
    result.stderr,
    /^sharddev: no account key in WILDSHARD_API_KEY or /mu,
  )
  assert.match(
    result.stderr,
    /\[account-key-missing\] fix: Run `wildshard account <email>`/u,
  )
})

test('a key folder that cannot be written refuses before any request', async (context: TestContext): Promise<void> => {
  const server = await openUploadServer(context)
  const home = await scratchHome(context)
  await writeFile(path.join(home, '.config'), 'a file, not a folder\n')

  const result = await account(server, home, [EMAIL])

  assert.equal(result.status, 3, result.stderr)
  assert.equal(server.state.apiRequests.length, 0)
  assert.equal(server.state.accounts.byEmail.size, 0)
})

test('the key goes only over https or to localhost', async (context: TestContext): Promise<void> => {
  const home = await scratchHome(context)

  const result = await runCli(
    ['account', EMAIL, '--server', 'http://api.example.com'],
    { HOME: home },
  )

  assert.equal(result.status, 3, result.stderr)
  assert.match(
    result.stderr,
    /the account key goes only to an https server \(or localhost\), not http:\/\/api\.example\.com/u,
  )
})

test('a malformed key is refused without echoing it', async (context: TestContext): Promise<void> => {
  const home = await scratchHome(context, 'not a key at all')

  const result = await runCli(['whoami'], { HOME: home })

  assert.equal(result.status, 3, result.stderr)
  assert.match(
    result.stderr,
    /the account key in \S+sharddev-key is not a wsk_ key/u,
  )
  assert.ok(!result.stderr.includes('not a key at all'))
})
