import { installFormatHook } from '@wildshard/format/formatHook'

// The replies `sharddev upload` reads from api-server (J61, J96), from
// format, which both depend on (J27). A wire change reaches both through a
// tag, and the upload fails on the parse rather than guess. Format ships raw
// .ts, so it loads here, behind the hook, and not by a static import.

installFormatHook()

export const {
  ErrorBodySchema,
  ShardfileListSchema,
  UploadResultSchema,
  DirectUploadTicketSchema,
} = await import('@wildshard/format/uploadWire')

export type {
  DirectUploadTicket,
  ShardfileSummary,
  UploadResult,
} from '@wildshard/format/uploadWire'
