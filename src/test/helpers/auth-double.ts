// oxlint-disable typescript/prefer-readonly-parameter-types -- a double's state is what it mutates
import { randomBytes, verify } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { object, parse, string } from 'valibot'

import { sendJson } from './http-double.ts'

// Who may call the api-server double: the creator signature (J60) and the
// account key (meta SHARD-DELETE DEL4, DEL5, DEL6). `POST /api/accounts`
// answers a `wsk_` key once per email (any case), then 409; the ticket and
// the commit need `Authorization: Bearer <key>`, else 401, as api-server
// answers since DEL5. `GET /api/accounts/me` names a key's account (api-server
// v0.12.0): the double's own key answers `me`, a key `POST /api/accounts`
// made answers its email and no slugs, any other key 401; `me` undefined is
// an older API with no such route (404).

const SIGNATURE_HEADER = 'x-wildshard-signature'
const KEY_BYTES = 16
const COMMIT = /^\/api\/shardfiles\/uploads\/[\da-f]{64}\/commit$/u
const TICKET = '/api/shardfiles/uploads'

const AccountRequestSchema = object({ email: string() })

/** What `GET /api/accounts/me` answers for the double's own key. */
interface Me {
  readonly email: string
  readonly slugs: number
  readonly deletedSlugs: number
}

/** The double's accounts. */
interface Accounts {
  /** The key the ticket and the commit take. */
  readonly apiKey: string
  /** The accounts `POST /api/accounts` made: lower-cased email to key. */
  readonly byEmail: Map<string, string>
  /** The own key's account; undefined: an API older than the route (404). */
  me: Me | undefined
}

interface Exchange {
  readonly request: IncomingMessage
  readonly response: ServerResponse
}

function newApiKey(): string {
  return `wsk_${randomBytes(KEY_BYTES).toString('hex')}`
}

function newAccounts(): Accounts {
  return {
    apiKey: newApiKey(),
    byEmail: new Map(),
    me: { email: 'owner@example.com', slugs: 2, deletedSlugs: 1 },
  }
}

/** Whether the request carries the creator signature over `hash`. */
function signedBy(
  key: KeyObject,
  hash: string,
  request: IncomingMessage,
): boolean {
  const header = request.headers[SIGNATURE_HEADER]
  const digest = Buffer.from(hash, 'hex')
  return (
    typeof header === 'string' &&
    verify(undefined, digest, key, Buffer.from(header, 'base64'))
  )
}

function makeAccount(
  accounts: Accounts,
  exchange: Exchange,
  body: string,
): void {
  const { email } = parse(AccountRequestSchema, JSON.parse(body))
  const known = email.toLowerCase()
  if (accounts.byEmail.has(known)) {
    sendJson(exchange.response, 409, { error: 'that email has an account' })
    return
  }
  const key = newApiKey()
  accounts.byEmail.set(known, key)
  sendJson(exchange.response, 201, { email: known, key })
}

const NO_SLUGS = 0

/** The account `header`'s key belongs to, or undefined. */
function meOf(accounts: Accounts, header: string): Me | undefined {
  if (header === `Bearer ${accounts.apiKey}`) {
    return accounts.me
  }
  const made = [...accounts.byEmail].find(
    ([, key]: readonly [string, string]): boolean => header === `Bearer ${key}`,
  )
  return made && { email: made[0], slugs: NO_SLUGS, deletedSlugs: NO_SLUGS }
}

/** `GET /api/accounts/me`: the key's account, 401, or 404 for an older API. */
function answerMe(accounts: Accounts, exchange: Exchange): void {
  const { request, response } = exchange
  const me = meOf(accounts, request.headers.authorization ?? '')
  if (accounts.me === undefined) {
    sendJson(response, 404, { error: 'not found' })
  } else if (me === undefined) {
    sendJson(response, 401, { error: 'unknown API key' })
  } else {
    sendJson(response, 200, {
      id: 'acct_0123456789abcdef0123456789abcdef',
      createdAt: '2026-11-13T00:00:00.000Z',
      ...me,
    })
  }
}

function needsKey(path: string): boolean {
  return path === TICKET || COMMIT.test(path)
}

const ACCOUNT_ROUTES: ReadonlyMap<
  string,
  (accounts: Accounts, exchange: Exchange, body: string) => void
> = new Map([
  ['/api/accounts', makeAccount],
  [
    '/api/accounts/me',
    (accounts: Accounts, exchange: Exchange): void => {
      answerMe(accounts, exchange)
    },
  ],
])

/** Answer an account call or a keyless upload call; false: not answered. */
function answerAccount(
  accounts: Accounts,
  exchange: Exchange,
  body: string,
): boolean {
  const { request, response } = exchange
  const path = request.url ?? ''
  const own = ACCOUNT_ROUTES.get(path)
  if (own !== undefined) {
    own(accounts, exchange, body)
    return true
  }
  if (
    needsKey(path) &&
    request.headers.authorization !== `Bearer ${accounts.apiKey}`
  ) {
    sendJson(response, 401, { error: 'an account key is required' })
    return true
  }
  return false
}

export { type Accounts, answerAccount, newAccounts, signedBy }
