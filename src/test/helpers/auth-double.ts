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
// answers since DEL5.

const SIGNATURE_HEADER = 'x-wildshard-signature'
const KEY_BYTES = 16
const COMMIT = /^\/api\/shardfiles\/uploads\/[\da-f]{64}\/commit$/u
const TICKET = '/api/shardfiles/uploads'

const AccountRequestSchema = object({ email: string() })

/** The double's accounts. */
interface Accounts {
  /** The key the ticket and the commit take. */
  readonly apiKey: string
  /** The accounts `POST /api/accounts` made: lower-cased email to key. */
  readonly byEmail: Map<string, string>
}

interface Exchange {
  readonly request: IncomingMessage
  readonly response: ServerResponse
}

function newApiKey(): string {
  return `wsk_${randomBytes(KEY_BYTES).toString('hex')}`
}

function newAccounts(): Accounts {
  return { apiKey: newApiKey(), byEmail: new Map() }
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

function needsKey(path: string): boolean {
  return path === TICKET || COMMIT.test(path)
}

/** Answer an account call or a keyless upload call; false: not answered. */
function answerAccount(
  accounts: Accounts,
  exchange: Exchange,
  body: string,
): boolean {
  const { request, response } = exchange
  const path = request.url ?? ''
  if (path === '/api/accounts') {
    makeAccount(accounts, exchange, body)
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
