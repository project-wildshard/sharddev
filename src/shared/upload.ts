import {
  array,
  boolean,
  literal,
  number,
  object,
  pipe,
  record,
  regex,
  string,
  variant,
} from 'valibot'

import type { InferOutput } from 'valibot'

// The replies `sharddev upload` reads from api-server (J61, J96). They
// mirror api-server's `src/shared/catalogue.ts`: sharddev does not depend
// on that repo, so a wire change there lands here too, and the upload
// fails on the parse rather than guess.

const HashSchema = pipe(string(), regex(/^[\da-f]{64}$/u))
const SignedHeadersSchema = record(string(), string())
const RevisionSchema = object({ shard: string(), revision: number() })

/** Already stored: nothing to send. Otherwise the PUT to make, exactly. */
const UploadTicketSchema = variant('stored', [
  object({ stored: literal(true) }),
  object({
    stored: literal(false),
    method: literal('PUT'),
    url: string(),
    headers: SignedHeadersSchema,
    expiresAt: string(),
  }),
])

const UploadResultSchema = object({
  hash: HashSchema,
  shard: string(),
  revision: number(),
  /** This upload added the revision. */
  created: boolean(),
  /** This upload made the revision the shard's preview. */
  staged: boolean(),
  bytes: number(),
  storedBytes: number(),
  signedBy: string(),
  notified: boolean(),
})

const StoredShardfileSchema = object({
  hash: HashSchema,
  bytes: number(),
  storedBytes: number(),
  revisions: array(RevisionSchema),
})

const StoredShardfilesSchema = object({
  shardfiles: array(StoredShardfileSchema),
})

const ErrorBodySchema = object({ error: string() })

type UploadTicket = InferOutput<typeof UploadTicketSchema>
type UploadResult = InferOutput<typeof UploadResultSchema>
type StoredShardfile = InferOutput<typeof StoredShardfileSchema>

export {
  ErrorBodySchema,
  StoredShardfilesSchema,
  UploadResultSchema,
  UploadTicketSchema,
  type StoredShardfile,
  type UploadResult,
  type UploadTicket,
}
