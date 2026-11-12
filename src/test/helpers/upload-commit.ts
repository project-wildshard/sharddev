import {
  literal,
  object,
  optional,
  pipe,
  regex,
  safeParse,
  string,
} from 'valibot'

import type { InferOutput } from 'valibot'

// The upload double's commit answers, as api-server's J275 commit gives them
// (API-CLOUDFLARE AC6, AC16): the body must carry `version` and `commit`
// (V1), and the answer adds `version`, `formatVersion` and `migrations`.

const SHARD = 'upload-test'
const TIME = '2026-11-05T00:00:00.000Z'
const FORMAT_VERSION = '0.1'
const OK = 200
const CREATED = 201
const CONFLICT = 409
const UNPROCESSABLE = 422

const CommitBodySchema = object({
  contentEncoding: optional(literal('br')),
  // The pattern api-server's channel-commit.ts uses.
  version: pipe(
    string(),
    regex(/^(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})$/u),
  ),
  commit: pipe(string(), regex(/^[\da-f]{40}$/u)),
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
  knownReply,
  listingOf,
  missingVersion,
}
