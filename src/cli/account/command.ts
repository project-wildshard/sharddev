import { refuse, reportLine } from '../report.ts'
import { makeAccount, whoami } from './account.ts'
import { keyTransport, readApiKey } from './key.ts'

import type { CliArgs } from '../args.ts'

// The CLI's side of meta SHARD-DELETE DEL6: `wildshard account <email>`,
// `wildshard whoami`, and the key upload sends. main.ts reads the
// environment and hands each value in. Exit codes are main.ts's.

const EXIT_OK = 0
const EXIT_USAGE = 1
const EXIT_FAILED = 3

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** What is missing before `account` may call the API, if anything. */
function accountUsage(args: CliArgs, server: string): string | undefined {
  if (args.operand === undefined) {
    return 'usage: wildshard account <email> [--server <url>] [--force]'
  }
  return server === ''
    ? 'usage: wildshard account <email> --server <url> (or set WILDSHARD_API_URL)'
    : undefined
}

/** `wildshard account <email>`: make the account and keep its key. */
async function runAccount(args: CliArgs, server: string): Promise<number> {
  const usage = accountUsage(args, server)
  if (usage !== undefined || args.operand === undefined) {
    refuse('account', '', usage ?? '')
    return EXIT_USAGE
  }
  try {
    await makeAccount({
      server,
      email: args.operand,
      force: args.force,
      report: reportLine,
    })
    return EXIT_OK
  } catch (error: unknown) {
    refuse('account', 'account failed: ', messageOf(error))
    return EXIT_FAILED
  }
}

/** `wildshard whoami`: the key upload would send, masked. */
async function runWhoami(fromEnv: string | undefined): Promise<number> {
  try {
    for (const line of await whoami(fromEnv)) {
      reportLine(line)
    }
    return EXIT_OK
  } catch (error: unknown) {
    refuse('account', '', messageOf(error))
    return EXIT_FAILED
  }
}

/**
 * The key upload sends (WILDSHARD_API_KEY, else the key file's), or an
 * Error for a key file that can't be read or a malformed key.
 */
async function apiKeyOf(
  fromEnv: string | undefined,
): Promise<string | Error | undefined> {
  try {
    const found = await readApiKey(fromEnv)
    return found?.key
  } catch (error: unknown) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

/**
 * What stops upload sending the key, before any request: no key (api-server
 * answers a keyless ticket 401 since DEL5), or a server that is not https.
 */
function uploadKeyRefusal(
  server: string,
  apiKey: string | undefined,
): string | undefined {
  return apiKey === undefined
    ? 'upload needs an account key: run wildshard account <email>, or set WILDSHARD_API_KEY'
    : keyTransport(server)
}

export { apiKeyOf, runAccount, runWhoami, uploadKeyRefusal }
