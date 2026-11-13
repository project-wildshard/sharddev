import { installFormatHook } from '@wildshard/format/formatHook'
import {
  array,
  intersect,
  literal,
  nullable,
  number,
  object,
  optional,
  string,
  tuple,
  unknown,
  variant,
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
 * SA30's `placement` (meta SHARD-AUTHORING, J314): the cell a new shard
 * got and the channels whose grid now has it, or why it got none. Absent
 * while api-server's `GRID_AUTOPLACE` is off, and for a shard not new.
 */
type Placement =
  | Readonly<{
      placed: true
      cell: readonly [number, number]
      channels: readonly string[]
    }>
  | Readonly<{ placed: false; reason: string }>

const CellSchema = tuple([number(), number()])

const PlacedSchema = object({
  placed: literal(true),
  cell: CellSchema,
  channels: array(string()),
})

const NotPlacedSchema = object({ placed: literal(false), reason: string() })

const PlacementSchema: GenericSchema<Placement> = variant('placed', [
  PlacedSchema,
  NotPlacedSchema,
])

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
  /**
   * SA30's grid step, read by placement.ts against `PlacementSchema`: the
   * commit is recorded by now, so a shape the CLI can't read never fails
   * the upload. Absent while placement is off.
   */
  readonly placement?: unknown
  /** DEL7: true when the commit brought a deleted shard back (preview only). */
  readonly revived?: unknown
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
  placement: optional(unknown()),
  revived: optional(unknown()),
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
  type Placement,
  CatalogueSchema,
  PlacementSchema,
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
