// oxlint-disable typescript/prefer-readonly-parameter-types -- a double's state is what it mutates
import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { object, safeParse, string } from 'valibot'

import { answerAccount } from './auth-double.ts'
import { sendJson } from './http-double.ts'

import type { Accounts } from './auth-double.ts'

// The two delete calls of api-server (meta SHARD-DELETE DEL1, DEL8), as
// the upload double answers them: the owner's key (the double's one account
// key) starts a delete of a slug it knows and gets a confirm token;
// finalize spends that token once. Another `wsk_` key is 403, no key 401,
// an unknown slug 404, and a wrong, used or expired token 409 with
// api-server's own words. A grid-placed slug deletes like any other and
// finalize frees its cell (api-server SA31, v0.11.0).

const DELETE =
  /^\/api\/shards\/(?<slug>[^/]+)\/delete(?<finalize>\/finalize)?$/u
const TOKEN_BYTES = 16
const TIME = '2026-11-05T00:10:00.000Z'
const FinalizeSchema = object({ confirm: string() })

/** What the delete double knows and saw. */
interface Deletions {
  /** Slugs the owner may delete. */
  readonly shards: Set<string>
  /** Slugs a grid cell places (staging [2, 3]): finalize frees the cell. */
  readonly placed: Set<string>
  /** The confirm token each slug's newest start answered. */
  readonly tokens: Map<string, string>
  /** Every start, by slug. */
  readonly starts: string[]
  /** Every finalize call, by slug, refused or not. */
  readonly finalizeCalls: string[]
  /** Every finalize that deleted, by slug. */
  readonly finalized: string[]
  /** Answer every finalize as a token past its 10 minutes. */
  expire: boolean
  /** Start's `summary.note` (DEL8). */
  note: string
}

interface Exchange {
  readonly request: IncomingMessage
  readonly response: ServerResponse
}

/** The upload double's state this file reads: its one account key owns every slug. */
interface Keyed {
  readonly accounts: Accounts
  readonly deletions: Deletions
}

function newDeletions(): Deletions {
  return {
    shards: new Set(),
    placed: new Set(),
    tokens: new Map(),
    starts: [],
    finalizeCalls: [],
    finalized: [],
    expire: false,
    note: 'no signed release plays it',
  }
}

/** The 401 or 403 api-server answers this caller, if any. */
function callerRefusal(
  apiKey: string,
  request: IncomingMessage,
  slug: string,
): Readonly<{ status: number; error: string }> | undefined {
  const header = request.headers.authorization ?? ''
  if (header === `Bearer ${apiKey}`) {
    return undefined
  }
  return header.startsWith('Bearer wsk_')
    ? {
        status: 403,
        error: `${slug} belongs to another account: only its owner's key can delete it`,
      }
    : { status: 401, error: 'bad admin token' }
}

const PLACED_CELL = [2, 3]

function summaryOf(deletions: Deletions, slug: string): unknown {
  return {
    deleted: false,
    versions: [
      { version: '0.0.1', revision: 1, hash: 'a'.repeat(64), pruned: false },
      { version: '0.0.2', revision: 2, hash: 'b'.repeat(64), pruned: false },
    ],
    channels: [
      { channel: 'preview', hash: 'b'.repeat(64) },
      { channel: 'staging', hash: 'b'.repeat(64) },
    ],
    grid: deletions.placed.has(slug)
      ? [{ channel: 'staging', cells: [PLACED_CELL] }]
      : [],
    releases: { staging: false, production: false },
    note: deletions.note,
  }
}

function start(
  deletions: Deletions,
  slug: string,
  response: ServerResponse,
): void {
  const confirm = `wsd_${randomBytes(TOKEN_BYTES).toString('hex')}`
  deletions.tokens.set(slug, confirm)
  deletions.starts.push(slug)
  sendJson(response, 200, {
    slug,
    confirm,
    expiresAt: TIME,
    summary: summaryOf(deletions, slug),
  })
}

function finalize(
  deletions: Deletions,
  call: Readonly<{ slug: string; body: string }>,
  response: ServerResponse,
): void {
  const { slug } = call
  deletions.finalizeCalls.push(slug)
  const parsed = safeParse(FinalizeSchema, JSON.parse(call.body))
  const token = deletions.tokens.get(slug)
  if (
    deletions.expire ||
    !parsed.success ||
    token === undefined ||
    parsed.output.confirm !== token
  ) {
    sendJson(response, 409, {
      error: `no delete of ${slug} waits for this confirm token (wrong, used or past its 10 minutes): start again`,
    })
    return
  }
  deletions.tokens.delete(slug)
  deletions.finalized.push(slug)
  sendJson(response, 200, {
    slug,
    deleted: true,
    deletedAt: TIME,
    channels: ['preview', 'staging'],
    cells: deletions.placed.has(slug) ? ['staging'] : [],
    placements: [],
    // oxlint-disable-next-line unicorn/no-null -- api-server answers null when the slug held no cell
    freed: deletions.placed.has(slug) ? PLACED_CELL : null,
    notified: false,
  })
}

/** One delete call to a slug, after the path matched. */
function routeDelete(
  state: Keyed,
  exchange: Exchange,
  call: Readonly<{ slug: string; body: string; finalize: boolean }>,
): void {
  const { request, response } = exchange
  const { slug, body } = call
  const { deletions } = state
  const refused = callerRefusal(state.accounts.apiKey, request, slug)
  if (refused !== undefined) {
    sendJson(response, refused.status, { error: refused.error })
  } else if (!deletions.shards.has(slug)) {
    sendJson(response, 404, { error: `no shard ${slug}` })
  } else if (call.finalize) {
    finalize(deletions, { slug, body }, response)
  } else {
    start(deletions, slug, response)
  }
}

/** Answer a delete call; false: not a delete path. */
function answerDelete(state: Keyed, exchange: Exchange, body: string): boolean {
  const match = DELETE.exec(exchange.request.url ?? '')?.groups
  if (match === undefined || exchange.request.method !== 'POST') {
    return false
  }
  const slug = decodeURIComponent(match['slug'] ?? '')
  const finalizing = match['finalize'] !== undefined
  routeDelete(state, exchange, { slug, body, finalize: finalizing })
  return true
}

/** Answer an account or a delete call; false: neither. */
function answerKeyed(state: Keyed, exchange: Exchange, body: string): boolean {
  return (
    answerAccount(state.accounts, exchange, body) ||
    answerDelete(state, exchange, body)
  )
}

export { type Deletions, answerKeyed, newDeletions }
