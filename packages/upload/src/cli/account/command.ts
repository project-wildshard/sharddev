import { createInterface } from 'node:readline'

import { deleteShard } from '../delete/delete.ts'
import { refuse, reportLine } from '../report.ts'
import { makeAccount, whoami } from './account.ts'
import { keyTransport, readApiKey } from './key.ts'

import type { CliArgs } from '../args.ts'

// The CLI's side of meta SHARD-DELETE DEL6 and DEL10, the commands of the
// account key: `wildshard account <email>`, `wildshard whoami`, the key
// upload sends, and `wildshard delete <slug> [--yes]` (the delete itself is
// ../delete/delete.ts). main.ts reads the environment and hands each value
// in. Exit codes are main.ts's. A delete with no slug, server or key
// refuses before any request; a slug typed wrong exits 1 with nothing
// deleted; a refused call exits 3.

const EXIT_OK = 0
const EXIT_USAGE = 1
const EXIT_FAILED = 3
/** A shard slug, as shard-format's upload wire spells it. */
const SLUG = /^[a-z][\d.a-z-]{0,127}$/u

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

/** `wildshard whoami`: the key upload would send, masked, and its account. */
async function runWhoami(
  fromEnv: string | undefined,
  server: string,
): Promise<number> {
  try {
    await whoami({ fromEnv, server, report: reportLine })
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

/** What `delete` needs from main.ts (meta SHARD-DELETE DEL10). */
interface DeleteCommand {
  readonly args: CliArgs
  /** `--server`, else WILDSHARD_API_URL, else empty. */
  readonly server: string
  /** WILDSHARD_API_KEY. */
  readonly fromEnv: string | undefined
}

/** Print the prompt and read one line from stdin; undefined at its end. */
async function typedLine(prompt: string): Promise<string | undefined> {
  process.stdout.write(prompt)
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
  try {
    const first = await lines[Symbol.asyncIterator]().next()
    return first.done === true ? undefined : first.value
  } finally {
    lines.close()
    if (!process.stdin.isTTY) {
      process.stdout.write('\n')
    }
  }
}

/** What stops `delete` before any request, if anything. */
function deleteUsage(command: DeleteCommand): string | undefined {
  if (command.args.operand === undefined) {
    return 'usage: wildshard delete <slug> [--yes] [--server <url>]'
  }
  if (!SLUG.test(command.args.operand)) {
    return `usage: wildshard delete <slug>, and a slug is a lower-case letter, then letters, digits, dots or hyphens, not ${command.args.operand}`
  }
  return command.server === ''
    ? 'usage: wildshard delete <slug> --server <url> (or set WILDSHARD_API_URL)'
    : undefined
}

/** The key to send, or why there is none (never the key itself). */
async function deleteKey(
  command: DeleteCommand,
): Promise<Readonly<{ key: string }> | string> {
  const usage = deleteUsage(command)
  if (usage !== undefined) {
    return usage
  }
  const key = await apiKeyOf(command.fromEnv)
  if (key instanceof Error) {
    return key.message
  }
  if (key === undefined) {
    return 'delete needs an account key: run wildshard account <email>, or set WILDSHARD_API_KEY'
  }
  return keyTransport(command.server) ?? { key }
}

/** The delete itself: 0 once deleted, 1 when not confirmed, 3 refused. */
async function deleteWith(
  command: DeleteCommand,
  apiKey: string,
  slug: string,
): Promise<number> {
  try {
    const kept = await deleteShard({
      server: command.server,
      apiKey,
      slug,
      yes: command.args.yes,
      ask: typedLine,
      report: reportLine,
    })
    if (kept === undefined) {
      return EXIT_OK
    }
    refuse('delete', '', kept)
    return EXIT_USAGE
  } catch (error: unknown) {
    refuse('delete', '', messageOf(error))
    return EXIT_FAILED
  }
}

/** `wildshard delete <slug>`: start, the summary, the typed slug, finalize. */
async function runDelete(command: DeleteCommand): Promise<number> {
  const apiKey = await deleteKey(command)
  const slug = command.args.operand
  if (typeof apiKey === 'string' || slug === undefined) {
    refuse('delete', '', typeof apiKey === 'string' ? apiKey : '')
    return EXIT_USAGE
  }
  return await deleteWith(command, apiKey.key, slug)
}

export { apiKeyOf, runAccount, runDelete, runWhoami, uploadKeyRefusal }
