// oxlint-disable typescript/prefer-readonly-parameter-types -- a double's state is what it mutates
import { createHash, generateKeyPairSync, verify } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { buffer } from 'node:stream/consumers'
import type { TestContext } from 'node:test'
import { brotliDecompressSync } from 'node:zlib'

import { literal, number, object, optional, parse, string } from 'valibot'

import {
  commitBodyOf,
  createdReply,
  knownReply,
  listingOf,
  missingVersion,
} from './upload-commit.ts'

import type { Recorded, Reply } from './upload-commit.ts'
import type { InferOutput } from 'valibot'

// An api-server stand-in for `sharddev upload`: real sockets, real Ed25519
// verification over the tarball's digest and a real Brotli decode, with
// the presigned PUT on a second server, as R2 is.

const JSON_TYPE = { 'content-type': 'application/json' }
const SIGNATURE_HEADER = 'x-wildshard-signature'
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
}

interface UploadServer {
  readonly url: string
  /** Base64 PKCS#8, as WILDSHARD_CREATOR_PRIVATE_KEY holds it. */
  readonly privateKey: string
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

async function listen(server: Server): Promise<string> {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('upload double: not listening on a TCP port')
  }
  return `http://127.0.0.1:${String(address.port)}`
}

async function close(server: Server): Promise<void> {
  const closed = once(server, 'close')
  server.closeAllConnections()
  server.close()
  await closed
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, JSON_TYPE).end(JSON.stringify(body))
}

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
  return known === undefined
    ? freshReply(double, request, { hash: call.hash, version: body.version })
    : knownReply(call.hash, known, body.version)
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
  double.state.apiRequests.push(exchange.request)
  route(double, exchange, body.toString('utf8'))
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
    puts: [],
    revisions: new Map(),
    commits: [],
    failPuts: 0,
    refuseCommit: undefined,
    refuseStored: undefined,
    unlisted: false,
    sso: false,
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
  return { url, privateKey: der.toString('base64'), state }
}

export { type UploadServer, type UploadServerState, openUploadServer }
