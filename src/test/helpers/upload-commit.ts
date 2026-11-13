import {
  literal,
  object,
  optional,
  picklist,
  pipe,
  regex,
  safeParse,
  string,
} from 'valibot'

import type { InferOutput } from 'valibot'

// The upload double's commit answers, as api-server's J275 commit gives them
// (API-CLOUDFLARE AC6, AC16): the body must carry `version` and `commit`
// (V1), and the answer adds `version`, `formatVersion` and `migrations`.
// UP3 adds `channel` and the three versions; like today's API the double
// drops them unless `echo` is on, as UP2's API will answer them.

const SHARD = 'upload-test'
const TIME = '2026-11-05T00:00:00.000Z'
const FORMAT_VERSION = '0.1'
const OK = 200
const CREATED = 201
const CONFLICT = 409
const UNPROCESSABLE = 422
const FIRST_FAILURE = 300
const X_Y_Z = /^(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})$/u

const VersionSchema = pipe(string(), regex(X_Y_Z))

const CommitBodySchema = object({
  contentEncoding: optional(literal('br')),
  // The pattern api-server's channel-commit.ts uses.
  version: VersionSchema,
  commit: pipe(string(), regex(/^[\da-f]{40}$/u)),
  channel: optional(picklist(['staging', 'production'])),
  engine: optional(VersionSchema),
  sharddev: optional(VersionSchema),
  shardFormat: optional(VersionSchema),
})

type CommitBody = InferOutput<typeof CommitBodySchema>

/** One upload the double recorded. */
interface Recorded {
  readonly revision: number
  readonly version: string
}

interface Reply {
  readonly status: number
  readonly body: unknown
}

interface Sizes {
  readonly bytes: number
  readonly storedBytes: number
}

function commitBodyOf(raw: unknown): CommitBody | undefined {
  const parsed = safeParse(CommitBodySchema, raw)
  return parsed.success ? parsed.output : undefined
}

function missingVersion(): Reply {
  return {
    status: UNPROCESSABLE,
    body: { error: 'pass `--version X.Y.Z` and `--commit <sha>`' },
  }
}

function answer(
  hash: string,
  recorded: Recorded,
  created: Readonly<{ created: boolean } & Sizes>,
): unknown {
  return {
    hash,
    shard: SHARD,
    revision: recorded.revision,
    staged: false,
    signedBy: 'test',
    notified: false,
    version: recorded.version,
    formatVersion: FORMAT_VERSION,
    migrations: [],
    ...created,
  }
}

/** A new upload's 201. */
function createdReply(hash: string, recorded: Recorded, sizes: Sizes): Reply {
  return {
    status: CREATED,
    body: answer(hash, recorded, { created: true, ...sizes }),
  }
}

/** Known bytes, as api-server's `known`: a retry, or another version's. */
function knownReply(hash: string, recorded: Recorded, version: string): Reply {
  return recorded.version === version
    ? {
        status: OK,
        body: answer(hash, recorded, {
          created: false,
          bytes: 1,
          storedBytes: 1,
        }),
      }
    : {
        status: CONFLICT,
        body: { error: `these bytes are already ${SHARD} ${recorded.version}` },
      }
}

/** A success with UP2's echo of the channel and the three versions. */
function echoed(reply: Reply, body: CommitBody): Reply {
  if (reply.status >= FIRST_FAILURE || typeof reply.body !== 'object') {
    return reply
  }
  const { channel, engine, sharddev, shardFormat } = body
  return {
    status: reply.status,
    body: { ...reply.body, channel, engine, sharddev, shardFormat },
  }
}

/** `GET /api/shardfiles` over what the double recorded. */
function listingOf(revisions: ReadonlyMap<string, Recorded>): unknown {
  return {
    shardfiles: [...revisions].map(
      ([hash, { revision }]: readonly [string, Recorded]): unknown => ({
        hash,
        bytes: 1,
        storedBytes: 1,
        uploadedAt: TIME,
        revisions: [{ shard: SHARD, revision }],
      }),
    ),
  }
}

export {
  type Recorded,
  type Reply,
  commitBodyOf,
  createdReply,
  echoed,
  knownReply,
  listingOf,
  missingVersion,
}
