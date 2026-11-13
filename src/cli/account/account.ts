import { object, safeParse, string } from 'valibot'

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
// the email is not proof of anything before DEL13. api-server has no route
// that names a key's account, so whoami reads the key locally only.

const CREATED = 201
const CONFLICT = 409

const AccountSchema = object({ email: string(), key: string() })
const ErrorSchema = object({ error: string() })

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

/** What whoami prints: the key's source and first characters. */
async function whoami(
  fromEnv: string | undefined,
  file: string = keyFile(),
): Promise<readonly string[]> {
  const found: ApiKey | undefined = await readApiKey(fromEnv, file)
  if (found === undefined) {
    throw new Error(`no account key in WILDSHARD_API_KEY or ${file}`)
  }
  return [
    `key ${maskKey(found.key)} from ${found.source}`,
    "the API has no route that names a key's account yet, so the email is not shown",
  ]
}

export { type AccountOptions, createAccount, makeAccount, whoami }
