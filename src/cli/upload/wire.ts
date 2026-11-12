import { installFormatHook } from '@wildshard/format/formatHook'
import { array, intersect, object, string, unknown } from 'valibot'

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
}

const MigrationsSchema = array(unknown())

const CommitFieldsSchema = object({
  version: string(),
  formatVersion: string(),
  migrations: MigrationsSchema,
})

const CommitAnswerSchema: GenericSchema<CommitAnswer> = intersect([
  UploadResultSchema,
  CommitFieldsSchema,
])

export {
  type CommitAnswer,
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
