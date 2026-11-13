import { installFormatHook } from '@wildshard/format/formatHook'
import {
  array,
  intersect,
  nullable,
  object,
  optional,
  string,
  unknown,
} from 'valibot'

import type { UploadResult } from '@wildshard/format/uploadWire'
import type { GenericSchema } from 'valibot'

// The replies `sharddev upload` reads from api-server (J61, J96), from
// format, which both depend on (J27). A wire change reaches both through a
// tag, and the upload fails on the parse rather than guess. Format ships raw
// .ts, so it loads here, behind the hook, and not by a static import.

installFormatHook()

const wire = await import('@wildshard/format/uploadWire')

const {
  ErrorBodySchema,
  ShardfileListSchema,
  UploadResultSchema,
  DirectUploadTicketSchema,
} = wire

/**
 * The J275 commit's answer (API-CLOUDFLARE AC6, AC16): format's
 * `UploadResult` plus the shard version, the API's format version and the
 * migrations that ran. Format's wire predates them, so sharddev reads the
 * three itself until a format tag carries them.
 */
interface CommitAnswer extends UploadResult {
  readonly version: string
  readonly formatVersion: string
  readonly migrations: readonly unknown[]
  /** UP2's echo of the channel and the versions; absent before it. */
  readonly channel?: string | null | undefined
  readonly engine?: string | null | undefined
  readonly sharddev?: string | null | undefined
  readonly shardFormat?: string | null | undefined
}

const MigrationsSchema = array(unknown())

/** A string the API may leave out, or send as null. */
const EchoSchema = optional(nullable(string()))

const CommitFieldsSchema = object({
  version: string(),
  formatVersion: string(),
  migrations: MigrationsSchema,
  channel: EchoSchema,
  engine: EchoSchema,
  sharddev: EchoSchema,
  shardFormat: EchoSchema,
})

const CommitAnswerSchema: GenericSchema<CommitAnswer> = intersect([
  UploadResultSchema,
  CommitFieldsSchema,
])

/**
 * `GET /api/catalogue`, as far as the hero pre-check reads it: each slug's
 * newest version and, once UP4 is live, its hero digest.
 */
interface CatalogueShard {
  readonly slug: string
  readonly version?: string | null | undefined
  readonly heroHash?: string | null | undefined
}

const CatalogueShardSchema = object({
  slug: string(),
  version: EchoSchema,
  heroHash: EchoSchema,
})

const CatalogueSchema: GenericSchema<{
  readonly shards: readonly CatalogueShard[]
}> = object({ shards: array(CatalogueShardSchema) })

export {
  type CatalogueShard,
  type CommitAnswer,
  CatalogueSchema,
  CommitAnswerSchema,
  DirectUploadTicketSchema,
  ErrorBodySchema,
  ShardfileListSchema,
  UploadResultSchema,
}

export type {
  DirectUploadTicket,
  ShardfileSummary,
  UploadResult,
} from '@wildshard/format/uploadWire'
