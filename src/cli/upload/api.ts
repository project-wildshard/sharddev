import { safeParse } from 'valibot'

import {
  CommitAnswerSchema,
  DirectUploadTicketSchema,
  ErrorBodySchema,
  ShardfileListSchema,
} from './wire.ts'

import type { Provenance } from './provenance.ts'
import type { SignedShardfile } from './signature.ts'
import type {
  CommitAnswer,
  DirectUploadTicket,
  ShardfileSummary,
} from './wire.ts'
import type { BaseIssue, BaseSchema, InferOutput } from 'valibot'

// The large-file protocol of api-server (its docs/design.md, V7): ticket,
// PUT to R2, commit. Vercel's protection sits in front of the API calls only:
// the PUT goes straight to R2, so the bypass header never goes with it.

const SIGNATURE_HEADER = 'x-wildshard-signature'
const BYPASS_HEADER = 'x-vercel-protection-bypass'
const PUT_ATTEMPTS = 3
const FIRST_SERVER_ERROR = 500
const FIRST_ATTEMPT = 1
const BYPASS_HINT =
  'not an api-server reply; a protected deployment needs VERCEL_AUTOMATION_BYPASS_SECRET'

interface ApiOptions {
  /** The api-server origin. */
  readonly server: string
  /** Vercel's automation bypass, for a protected deployment. */
  readonly bypassSecret?: string
}

interface UploadRequest {
  readonly hash: string
  readonly storedBytes: number
  readonly contentEncoding?: 'br'
}

interface PutTarget {
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
}

type AnySchema = BaseSchema<unknown, unknown, BaseIssue<unknown>>

function apiHeaders(options: ApiOptions): Record<string, string> {
  return options.bypassSecret === undefined
    ? {}
    : { [BYPASS_HEADER]: options.bypassSecret }
}

function jsonOf(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text)
    return value
  } catch {
    return undefined
  }
}

function refusal(path: string, status: number, body?: unknown): Error {
  const parsed = safeParse(ErrorBodySchema, body)
  const reason = parsed.success ? parsed.output.error : BYPASS_HINT
  return new Error(`${path} answered ${String(status)}: ${reason}`)
}

/** The reply's parsed body; a refusal or anything unparseable throws. */
async function replyOf<Schema extends AnySchema>(
  path: string,
  reply: Response,
  schema: Schema,
): Promise<InferOutput<Schema>> {
  const body = jsonOf(await reply.text())
  if (!reply.ok) {
    throw refusal(path, reply.status, body)
  }
  const parsed = safeParse(schema, body)
  if (!parsed.success) {
    throw refusal(path, reply.status)
  }
  return parsed.output
}

async function postSigned<Schema extends AnySchema>(
  options: ApiOptions,
  call: Readonly<{ path: string; signature: string; body: object }>,
  schema: Schema,
): Promise<InferOutput<Schema>> {
  const reply = await fetch(new URL(call.path, options.server), {
    method: 'POST',
    headers: {
      ...apiHeaders(options),
      'content-type': 'application/json',
      [SIGNATURE_HEADER]: call.signature,
    },
    body: JSON.stringify(call.body),
  })
  return await replyOf(call.path, reply, schema)
}

/** The stored shardfile with this hash, if there is one. */
async function findStored(
  options: ApiOptions,
  hash: string,
): Promise<ShardfileSummary | undefined> {
  const path = '/api/shardfiles'
  const reply = await fetch(new URL(path, options.server), {
    headers: apiHeaders(options),
  })
  const { shardfiles } = await replyOf(path, reply, ShardfileListSchema)
  return shardfiles.find(
    (stored: Readonly<{ hash: string }>): boolean => stored.hash === hash,
  )
}

async function requestTicket(
  options: ApiOptions,
  request: UploadRequest,
  signature: string,
): Promise<DirectUploadTicket> {
  return await postSigned(
    options,
    { path: '/api/shardfiles/uploads', signature, body: request },
    DirectUploadTicketSchema,
  )
}

async function attemptPut(
  target: PutTarget,
  body: Readonly<Uint8Array>,
): Promise<Response | undefined> {
  try {
    return await fetch(target.url, {
      method: 'PUT',
      headers: target.headers,
      body: new Uint8Array(body),
    })
  } catch {
    return undefined
  }
}

function retries(reply: Response | undefined): boolean {
  return reply === undefined || reply.status >= FIRST_SERVER_ERROR
}

/** PUT with exactly the signed headers; a dropped connection or 5xx retries. */
async function putObject(
  target: PutTarget,
  body: Readonly<Uint8Array>,
  attempt: number = FIRST_ATTEMPT,
): Promise<void> {
  const reply = await attemptPut(target, body)
  if (reply?.ok === true) {
    return
  }
  if (retries(reply) && attempt < PUT_ATTEMPTS) {
    await putObject(target, body, attempt + FIRST_ATTEMPT)
    return
  }
  const answer =
    reply === undefined
      ? 'no reply'
      : `${String(reply.status)}: ${await reply.text()}`
  throw new Error(`the PUT to R2 failed: ${answer}`)
}

/** The commit: the bytes' encoding, and the shard version and commit (V1). */
async function commitUpload(
  options: ApiOptions,
  signed: SignedShardfile,
  body: Provenance & { readonly contentEncoding?: 'br' | undefined },
): Promise<CommitAnswer> {
  const { contentEncoding, version, commit } = body
  return await postSigned(
    options,
    {
      path: `/api/shardfiles/uploads/${signed.hash}/commit`,
      signature: signed.signature,
      body: {
        ...(contentEncoding === undefined ? {} : { contentEncoding }),
        version,
        commit,
      },
    },
    CommitAnswerSchema,
  )
}

export {
  type ApiOptions,
  type UploadRequest,
  commitUpload,
  findStored,
  putObject,
  requestTicket,
}
