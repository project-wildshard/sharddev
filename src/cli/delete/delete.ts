import {
  array,
  boolean,
  number,
  object,
  optional,
  safeParse,
  string,
} from 'valibot'

// `wildshard delete <slug>` (meta SHARD-DELETE DEL10, J307, J310): the
// owner's two calls back to back. Start (`POST /api/shards/:slug/delete`)
// answers a confirm token, good for 10 minutes, and a summary whose `note`
// says whether a signed release still plays the shard (DEL8); the author
// reads it and types the slug; finalize (`…/delete/finalize {confirm}`)
// spends the token. A typed slug that is not the slug finalizes nothing,
// and `yes` (`--yes`, for scripts) skips the typing. Both calls send the
// account key as `Authorization: Bearer`; the key and the token are never
// printed.

const OK = 200
const CONFLICT = 409
const SHORT_HASH = 8
const FIRST = 0

const ErrorSchema = object({ error: string() })
const VersionSchema = object({ version: string(), hash: string() })
const PointerSchema = object({ channel: string() })
const CellSchema = array(number())
const PlacedSchema = object({ channel: string(), cells: array(CellSchema) })

const SummarySchema = object({
  deleted: optional(boolean()),
  versions: array(VersionSchema),
  channels: array(PointerSchema),
  grid: optional(array(PlacedSchema)),
  note: optional(string()),
})

const StartSchema = object({
  confirm: string(),
  expiresAt: string(),
  summary: SummarySchema,
})

const ChannelsSchema = array(string())

const FinalizeSchema = object({
  deletedAt: string(),
  channels: ChannelsSchema,
  placements: ChannelsSchema,
  /** The channels whose grid cells named the slug (api-server SA31). */
  cells: optional(ChannelsSchema),
})

/** What finalize did, as the API answers it. */
type Finalized = Readonly<{
  deletedAt: string
  channels: readonly string[]
  placements: readonly string[]
  cells?: readonly string[] | undefined
}>

type Started = Readonly<{
  confirm: string
  expiresAt: string
  summary: Readonly<{
    deleted?: boolean | undefined
    versions: readonly Readonly<{ version: string; hash: string }>[]
    channels: readonly Readonly<{ channel: string }>[]
    grid?: readonly Placed[] | undefined
    note?: string | undefined
  }>
}>

type Placed = Readonly<{
  channel: string
  cells: readonly (readonly number[])[]
}>

interface DeleteOptions {
  /** The api-server origin. */
  readonly server: string
  /** The owner's `wsk_` key. */
  readonly apiKey: string
  readonly slug: string
  /** Skip the typed slug (`--yes`). */
  readonly yes: boolean
  /** Print the prompt and read one typed line; undefined when none comes. */
  readonly ask: (prompt: string) => Promise<string | undefined>
  readonly report: (line: string) => void
}

function jsonOf(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text)
    return value
  } catch {
    return undefined
  }
}

function reasonOf(body: unknown): string {
  const parsed = safeParse(ErrorSchema, body)
  return parsed.success ? parsed.output.error : 'not an api-server reply'
}

/** One delete call: its status and parsed body. */
async function call(
  options: DeleteOptions,
  route: string,
  body?: unknown,
): Promise<Readonly<{ status: number; body: unknown }>> {
  const slug = encodeURIComponent(options.slug)
  const reply = await fetch(
    new URL(`/api/shards/${slug}/${route}`, options.server),
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
    },
  )
  return { status: reply.status, body: jsonOf(await reply.text()) }
}

async function startDelete(options: DeleteOptions): Promise<Started> {
  const reply = await call(options, 'delete')
  const parsed = safeParse(StartSchema, reply.body)
  if (reply.status !== OK || !parsed.success) {
    throw new Error(
      `delete ${options.slug}: start answered ${String(reply.status)}: ${reasonOf(reply.body)}`,
    )
  }
  return parsed.output
}

function listed(names: readonly string[]): string {
  return names.length === FIRST ? 'none' : names.join(', ')
}

/** Each grid cell placing the slug: `staging [2, 3]`. */
function gridCells(grid: readonly Placed[] | undefined): readonly string[] {
  return (grid ?? []).flatMap((row: Placed): string[] =>
    row.cells.map(
      (cell: readonly number[]): string =>
        `${row.channel} [${cell.join(', ')}]`,
    ),
  )
}

/** What start found, in the author's words. */
function summaryLines(slug: string, started: Started): readonly string[] {
  const { summary } = started
  const versions = summary.versions.map(
    (row: Readonly<{ version: string; hash: string }>): string =>
      `${row.version} ${row.hash.slice(FIRST, SHORT_HASH)}`,
  )
  const channels = summary.channels.map(
    (row: Readonly<{ channel: string }>): string => row.channel,
  )
  return [
    `delete ${slug}: ${String(versions.length)} versions (${listed(versions)})`,
    `channels pointing at it: ${listed(channels)}`,
    `grid cells placing it: ${listed(gridCells(summary.grid))}`,
    ...(summary.note === undefined ? [] : [summary.note]),
    ...(summary.deleted === true
      ? [`${slug} is deleted already: finalize changes nothing`]
      : []),
    `the confirm token lasts until ${started.expiresAt} (10 minutes)`,
  ]
}

/** What finalize did, in the author's words; the last line says deleted. */
function doneLines(slug: string, done: Finalized): readonly string[] {
  const cells =
    done.cells === undefined
      ? ''
      : `; grid cells dropped on: ${listed(done.cells)}`
  return [
    `pointers dropped on: ${listed(done.channels)}; solo placements dropped on: ${listed(done.placements)}${cells}`,
    `deleted ${slug} at ${done.deletedAt}: hidden from the catalogue and every grid`,
  ]
}

async function finalizeDelete(
  options: DeleteOptions,
  confirm: string,
): Promise<readonly string[]> {
  const { slug } = options
  const reply = await call(options, 'delete/finalize', { confirm })
  const parsed = safeParse(FinalizeSchema, reply.body)
  const reason = reasonOf(reply.body)
  if (reply.status === CONFLICT && reason.includes('confirm token')) {
    throw new Error(
      `delete ${slug}: finalize answered 409: ${reason}. Nothing was deleted; start again with wildshard delete ${slug}`,
    )
  }
  if (reply.status !== OK || !parsed.success) {
    throw new Error(
      `delete ${slug}: finalize answered ${String(reply.status)}: ${reason}`,
    )
  }
  return doneLines(slug, parsed.output)
}

/** Why the author's answer does not confirm the delete, if it doesn't. */
async function notConfirmed(
  options: DeleteOptions,
): Promise<string | undefined> {
  const { slug } = options
  if (options.yes) {
    return undefined
  }
  const typed = await options.ask(
    `type ${slug} to delete it (anything else keeps it): `,
  )
  if (typed?.trim() === slug) {
    return undefined
  }
  const what = typed === undefined ? 'nothing' : `"${typed.trim()}"`
  return `delete ${slug} not confirmed: you typed ${what}, not ${slug}, so nothing was deleted`
}

/**
 * Start, show the summary, take the typed slug (unless `yes`), finalize.
 * Undefined once deleted, or why nothing was deleted.
 */
async function deleteShard(
  options: DeleteOptions,
): Promise<string | undefined> {
  const started = await startDelete(options)
  for (const line of summaryLines(options.slug, started)) {
    options.report(line)
  }
  const refused = await notConfirmed(options)
  if (refused !== undefined) {
    return refused
  }
  for (const line of await finalizeDelete(options, started.confirm)) {
    options.report(line)
  }
  return undefined
}

export { type DeleteOptions, deleteShard }
