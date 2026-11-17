import { number, object, safeParse, string } from 'valibot'

import {
  draftKeyFile,
  keyFile,
  keyFileExists,
  keyTransport,
  maskKey,
  readApiKey,
} from './key.ts'

import type { ApiKey } from './key.ts'

// `wildshard account <email>` and `wildshard whoami` (meta SHARD-DELETE DEL6,
// J309, J310). The account is api-server's `POST /api/accounts {email}`: a
// 201 answers `{email, key}`, the only time the key is shown, and an email
// with an account is a 409 whose key stays as it was. No mail is sent and
// the email is not proof of anything before DEL13. whoami names the key's
// source and first characters, then asks `GET /api/accounts/me` (api-server
// v0.12.0) for its account's email and slug count; an older API's 404 keeps
// the local lines only.

const OK = 200
const CREATED = 201
const UNAUTHORIZED = 401
const CONFLICT = 409
const NOT_FOUND = 404
const NONE = 0
const ONE = 1
const ME_TIMEOUT_MS = 15_000

const AccountSchema = object({ email: string(), key: string() })
const ErrorSchema = object({ error: string() })
const MeSchema = object({
  email: string(),
  slugs: number(),
  deletedSlugs: number(),
})

interface AccountOptions {
  /** The api-server origin. */
  readonly server: string
  readonly email: string
  /** Replace a key file that is there already. */
  readonly force: boolean
  /** The key file to write; the default is under the user's home. */
  readonly file?: string
  readonly report: (line: string) => void
}

function jsonOf(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text)
    return value
  } catch {
    return undefined
  }
}

function reasonOf(body: unknown): string {
  const parsed = safeParse(ErrorSchema, body)
  return parsed.success ? parsed.output.error : 'not an api-server reply'
}

/** One `POST /api/accounts`: the new account's email and key. */
async function createAccount(
  server: string,
  email: string,
): Promise<{ readonly email: string; readonly key: string }> {
  const reply = await fetch(new URL('/api/accounts', server), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const body = jsonOf(await reply.text())
  if (reply.status === CONFLICT) {
    throw new Error(
      `${email} already has an account; its key is not shown again, and a lost key needs an operator reset`,
    )
  }
  const parsed = safeParse(AccountSchema, body)
  if (reply.status !== CREATED || !parsed.success) {
    throw new Error(
      `/api/accounts answered ${String(reply.status)}: ${reasonOf(body)}`,
    )
  }
  return parsed.output
}

/** Why no account may be made yet, before any request: never a lost key. */
async function accountRefusal(
  options: AccountOptions,
  file: string,
): Promise<string | undefined> {
  if (!options.force && (await keyFileExists(file))) {
    return `${file} already holds a key; pass --force to replace it (the old key keeps working)`
  }
  return keyTransport(options.server)
}

/**
 * Make the account and keep its key. An existing key file, a server that is
 * not https and a key folder that can't be written all refuse before any
 * request, so no account is made whose key could not be kept.
 */
async function makeAccount(options: AccountOptions): Promise<void> {
  const file = options.file ?? keyFile()
  const refusal = await accountRefusal(options, file)
  if (refusal !== undefined) {
    throw new Error(refusal)
  }
  const draft = await draftKeyFile(file, options.force)
  const account = await createAccount(options.server, options.email).catch(
    async (error: unknown): Promise<never> => {
      await draft.drop()
      throw error
    },
  )
  await draft.keep(account.key)
  options.report(
    `account ${account.email}: key ${maskKey(account.key)} saved to ${file} (mode 600); it is not shown again`,
  )
}

/** The account line: its email and the slugs it owns. */
function accountLine(body: unknown, status: number): string {
  const parsed = safeParse(MeSchema, body)
  if (status !== OK || !parsed.success) {
    throw new Error(
      `/api/accounts/me answered ${String(status)}: ${reasonOf(body)}`,
    )
  }
  const { email, slugs, deletedSlugs } = parsed.output
  const deleted =
    deletedSlugs > NONE ? ` (and ${String(deletedSlugs)} deleted)` : ''
  const noun = slugs === ONE ? 'slug' : 'slugs'
  return `account ${email} owns ${String(slugs)} ${noun}${deleted}`
}

/** One `GET /api/accounts/me`: the account line, or the older API's line. */
async function accountOfKey(server: string, key: string): Promise<string> {
  const refusal = keyTransport(server)
  if (refusal !== undefined) {
    throw new Error(refusal)
  }
  const reply = await fetch(new URL('/api/accounts/me', server), {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(ME_TIMEOUT_MS),
  })
  const body = jsonOf(await reply.text())
  if (reply.status === NOT_FOUND) {
    return `${server} has no /api/accounts/me (not api-server, or older than v0.12.0), so the email is not shown`
  }
  if (reply.status === UNAUTHORIZED) {
    throw new Error(
      `${server} does not know this key (401): run wildshard account <email> on this server, or check WILDSHARD_API_KEY`,
    )
  }
  return accountLine(body, reply.status)
}

/** What whoami needs: the key's sources, the server and where lines go. */
interface WhoamiOptions {
  /** WILDSHARD_API_KEY. */
  readonly fromEnv: string | undefined
  /** `--server`, else WILDSHARD_API_URL, else empty. */
  readonly server: string
  readonly report: (line: string) => void
  /** The key file; the default is under the user's home. */
  readonly file?: string
}

/**
 * `wildshard whoami`: report the key's source and first characters, then its account's
 * email and slug count from `server` (no server: say so). The key line is
 * reported before the request, so a failed request still shows it.
 */
async function whoami(options: WhoamiOptions): Promise<void> {
  const { fromEnv, server, report } = options
  const file = options.file ?? keyFile()
  const found: ApiKey | undefined = await readApiKey(fromEnv, file)
  if (found === undefined) {
    throw new Error(`no account key in WILDSHARD_API_KEY or ${file}`)
  }
  report(`key ${maskKey(found.key)} from ${found.source}`)
  report(
    server === ''
      ? 'no server (pass --server <url> or set WILDSHARD_API_URL), so the email is not shown'
      : await accountOfKey(server, found.key),
  )
}

export {
  type AccountOptions,
  type WhoamiOptions,
  createAccount,
  makeAccount,
  whoami,
}
