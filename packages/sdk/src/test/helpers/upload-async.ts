// oxlint-disable typescript/prefer-readonly-parameter-types -- the HTTP double advances a scripted verdict sequence
import type { IncomingMessage, ServerResponse } from 'node:http'

import { object, parse, string } from 'valibot'

import { sendJson } from './http-double.ts'

import type { UploadState } from '../../../packages/upload/src/cli/upload/wire.ts'
import type { Reply } from './upload-commit.ts'

interface AsyncUploads {
  enabled: boolean
  sequence: UploadState[]
  report: unknown
  replyId?: string
  readonly uploads: Map<string, string>
  readonly reads: IncomingMessage[]
}
const Hash = object({ hash: string() })
const FIRST = 0
const BAD_REQUEST = 400
const ID_LENGTH = 12

function newAsyncUploads(): AsyncUploads {
  return {
    enabled: false,
    sequence: ['live'],
    report: { failures: [{ reason: 'portal walk failed' }] },
    uploads: new Map(),
    reads: [],
  }
}

function acceptedAsync(state: AsyncUploads, reply: Reply): Reply {
  if (!state.enabled || reply.status >= BAD_REQUEST) {
    return reply
  }
  const { hash } = parse(Hash, reply.body)
  const uploadId = `upload-${hash.slice(FIRST, ID_LENGTH)}`
  state.uploads.set(uploadId, hash)
  return {
    status: 202,
    body: {
      ...(typeof reply.body === 'object' ? reply.body : {}),
      uploadId,
      status: 'cooking',
    },
  }
}

function answerStatus(
  state: AsyncUploads,
  exchange: Readonly<{ response: ServerResponse }>,
  identity: Readonly<{
    id: string
    hash: string | undefined
    authorized: boolean
  }>,
): void {
  const { id, hash, authorized } = identity
  if (!authorized) {
    sendJson(exchange.response, 401, { error: 'no account key' })
  } else if (hash === undefined) {
    sendJson(exchange.response, 404, { error: 'no such upload' })
  } else {
    const status = state.sequence.shift() ?? 'live'
    sendJson(exchange.response, 200, {
      uploadId: state.replyId ?? id,
      hash,
      status,
      createdAt: 1,
      updatedAt: 2,
      ...(status === 'refused' ? { report: state.report } : {}),
      ...(status === 'live'
        ? {
            build: 'test-build',
            placement: {
              placed: true,
              cell: [0, 3],
              channels: ['preview', 'staging'],
            },
          }
        : {}),
    })
  }
}

function answerAsync(
  state: AsyncUploads,
  exchange: Readonly<{ request: IncomingMessage; response: ServerResponse }>,
  apiKey: string,
): boolean {
  const path = exchange.request.url ?? ''
  if (
    !state.enabled ||
    exchange.request.method !== 'GET' ||
    !path.startsWith('/api/shardfiles/uploads/')
  ) {
    return false
  }
  state.reads.push(exchange.request)
  const id = decodeURIComponent(path.slice('/api/shardfiles/uploads/'.length))
  const hash = state.uploads.get(id)
  answerStatus(state, exchange, {
    id,
    hash,
    authorized: exchange.request.headers.authorization === `Bearer ${apiKey}`,
  })
  return true
}

export { type AsyncUploads, acceptedAsync, answerAsync, newAsyncUploads }
