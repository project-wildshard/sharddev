// oxlint-disable typescript/prefer-readonly-parameter-types -- a double's state is what it mutates
import { createHash, generateKeyPairSync } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { buffer } from 'node:stream/consumers'
import type { TestContext } from 'node:test'
import { brotliDecompressSync } from 'node:zlib'

import { literal, number, object, optional, parse, string } from 'valibot'

import { newAccounts, signedBy } from './auth-double.ts'
import { answerKeyed, newDeletions } from './delete-double.ts'
import { close, listen, sendJson } from './http-double.ts'
import {
  commitBodyOf,
  createdReply,
  echoed,
  knownReply,
  listingOf,
  missingVersion,
} from './upload-commit.ts'

import type { Accounts } from './auth-double.ts'
import type { Deletions } from './delete-double.ts'
import type { Recorded, Reply } from './upload-commit.ts'
import type { InferOutput } from 'valibot'

// An api-server stand-in for `sharddev upload`: real sockets, real Ed25519
// verification over the tarball's digest and a real Brotli decode, with
// the presigned PUT on a second server, as R2 is. The signature and the
// account key (meta SHARD-DELETE DEL6) are auth-double.ts's, DEL10's
// delete calls delete-double.ts's.

const COMMIT = /^\/api\/shardfiles\/uploads\/(?<hash>[\da-f]{64})\/commit$/u
const TIME = '2026-11-05T00:00:00.000Z'

const TicketRequestSchema = object({
  hash: string(),
  storedBytes: number(),
  contentEncoding: optional(literal('br')),
})

type TicketRequest = InferOutput<typeof TicketRequestSchema>

interface StoredObject {
  readonly bytes: Buffer
  readonly headers: Readonly<Record<string, string | string[] | undefined>>
}

/** What the double saw, and how it should misbehave. */
interface UploadServerState {
  readonly apiRequests: IncomingMessage[]
  /** `GET /api/catalogue`'s shards: each slug's newest version (UP4). */
  readonly catalogue: CatalogueShard[]
  readonly puts: StoredObject[]
  /** Revisions recorded, by hash. */
  readonly revisions: Map<string, Recorded>
  /** Every commit body, parsed or not. */
  readonly commits: unknown[]
  /** PUT replies still to answer 503. */
  failPuts: number
  /** The reason commits are refused with, if any. */
  refuseCommit: string | undefined
  /** The reason a ticket for stored bytes is refused with, if any. */
  refuseStored: string | undefined
  /** Leave every recorded hash out of the listing. */
  unlisted: boolean
  /** Answer every API call with Vercel's HTML, as SSO does. */
  sso: boolean
  /** Echo the channel and the three versions, as UP2's API will. */
  echo: boolean
  readonly accounts: Accounts
  readonly deletions: Deletions
}

/** A catalogue shard as the double serves it. */
interface CatalogueShard {
  readonly slug: string
  readonly version: string
  readonly heroHash?: string
}

interface UploadServer {
  readonly url: string
  /** Base64 PKCS#8, as WILDSHARD_CREATOR_PRIVATE_KEY holds it. */
  readonly privateKey: string
  /** The account key the ticket and the commit take (DEL5). */
  readonly apiKey: string
  readonly state: UploadServerState
}

interface Double {
  readonly key: KeyObject
  readonly putUrl: string
  readonly state: UploadServerState
}

interface Exchange {
  readonly request: IncomingMessage
  readonly response: ServerResponse
}

interface Refusal {
  readonly status: number
  readonly error: string
}

function tarballOf(stored: StoredObject): Buffer {
  return stored.headers['content-encoding'] === 'br'
    ? brotliDecompressSync(stored.bytes)
    : stored.bytes
}

function commitRefusal(
  double: Double,
  request: IncomingMessage,
  hash: string,
): Refusal | undefined {
  const { key, state } = double
  const stored = state.puts.at(-1)
  if (!signedBy(key, hash, request)) {
    return { status: 401, error: 'not signed' }
  }
  if (stored === undefined) {
    return { status: 409, error: 'nothing was uploaded for this hash' }
  }
  if (state.refuseCommit !== undefined) {
    return { status: 422, error: state.refuseCommit }
  }
  const digest = createHash('sha256').update(tarballOf(stored)).digest('hex')
  return digest === hash
    ? undefined
    : { status: 422, error: 'the bytes are not this hash' }
}

/** A new upload: the double's checks, then its 201. */
function freshReply(
  double: Double,
  request: IncomingMessage,
  fresh: Readonly<{ hash: string; version: string }>,
): Reply {
  const refused = commitRefusal(double, request, fresh.hash)
  const stored = double.state.puts.at(-1)
  if (refused !== undefined || stored === undefined) {
    return { status: refused?.status ?? 500, body: { error: refused?.error } }
  }
  const { revisions } = double.state
  const recorded = { revision: revisions.size + 1, version: fresh.version }
  revisions.set(fresh.hash, recorded)
  return createdReply(fresh.hash, recorded, {
    bytes: tarballOf(stored).length,
    storedBytes: stored.bytes.length,
  })
}

/** What the commit answers: §2's 422, a known hash, or a new upload. */
function commitReply(
  double: Double,
  request: IncomingMessage,
  call: Readonly<{ hash: string; body: string }>,
): Reply {
  const raw: unknown = JSON.parse(call.body)
  double.state.commits.push(raw)
  const body = commitBodyOf(raw)
  if (body === undefined) {
    return missingVersion()
  }
  const known = double.state.revisions.get(call.hash)
  const reply =
    known === undefined
      ? freshReply(double, request, { hash: call.hash, version: body.version })
      : knownReply(call.hash, known, body.version)
  return double.state.echo ? echoed(reply, body) : reply
}

function ticket(double: Double, exchange: Exchange, body: string): void {
  const raw: unknown = JSON.parse(body)
  const request: TicketRequest = parse(TicketRequestSchema, raw)
  const { hash, storedBytes, contentEncoding } = request
  const { refuseStored, revisions } = double.state
  if (revisions.has(hash)) {
    sendJson(
      exchange.response,
      refuseStored === undefined ? 200 : 422,
      refuseStored === undefined ? { stored: true } : { error: refuseStored },
    )
    return
  }
  const status = signedBy(double.key, hash, exchange.request) ? 200 : 401
  sendJson(exchange.response, status, {
    stored: false,
    method: 'PUT',
    url: `${double.putUrl}/object`,
    headers: {
      'content-type': 'application/x-tar',
      'content-length': String(storedBytes),
      ...(contentEncoding === undefined
        ? {}
        : { 'content-encoding': contentEncoding }),
    },
    expiresAt: TIME,
  })
}

function route(double: Double, exchange: Exchange, body: string): void {
  const { request, response } = exchange
  const path = request.url ?? ''
  const committed = COMMIT.exec(path)?.groups?.['hash']
  if (double.state.sso) {
    response.writeHead(401, { 'content-type': 'text/html' }).end('<html>')
  } else if (committed !== undefined) {
    const reply = commitReply(double, request, { hash: committed, body })
    sendJson(response, reply.status, reply.body)
  } else if (path === '/api/shardfiles/uploads') {
    ticket(double, exchange, body)
  } else if (path === '/api/catalogue') {
    sendJson(response, 200, { shards: double.state.catalogue })
  } else {
    sendJson(
      response,
      200,
      listingOf(double.state.unlisted ? new Map() : double.state.revisions),
    )
  }
}

async function answerApi(double: Double, exchange: Exchange): Promise<void> {
  const body = await buffer(exchange.request)
  const { state } = double
  state.apiRequests.push(exchange.request)
  const text = body.toString('utf8')
  if (state.sso || !answerKeyed(state, exchange, text)) {
    route(double, exchange, text)
  }
}

async function answerPut(
  state: UploadServerState,
  exchange: Exchange,
): Promise<void> {
  const { request, response } = exchange
  const bytes = await buffer(request)
  if (state.failPuts > 0) {
    state.failPuts -= 1
    response.writeHead(503).end('slow down')
    return
  }
  state.puts.push({ bytes, headers: request.headers })
  response.writeHead(200).end()
}

function newState(): UploadServerState {
  return {
    apiRequests: [],
    catalogue: [],
    puts: [],
    revisions: new Map(),
    commits: [],
    failPuts: 0,
    refuseCommit: undefined,
    refuseStored: undefined,
    unlisted: false,
    sso: false,
    echo: false,
    accounts: newAccounts(),
    deletions: newDeletions(),
  }
}

/** Start the double; the test's `after` closes it. */
async function openUploadServer(context: TestContext): Promise<UploadServer> {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const state = newState()
  const r2 = createServer(
    (request: IncomingMessage, response: ServerResponse): void => {
      void answerPut(state, { request, response })
    },
  )
  const double = { key: publicKey, putUrl: await listen(r2), state }
  const api = createServer(
    (request: IncomingMessage, response: ServerResponse): void => {
      void answerApi(double, { request, response })
    },
  )
  const url = await listen(api)
  context.after(async (): Promise<void> => {
    await Promise.all([close(api), close(r2)])
  })
  const der = privateKey.export({ format: 'der', type: 'pkcs8' })
  const { apiKey } = state.accounts
  return { url, privateKey: der.toString('base64'), apiKey, state }
}

export {
  type CatalogueShard,
  type UploadServer,
  type UploadServerState,
  openUploadServer,
}
