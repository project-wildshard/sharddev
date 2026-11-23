import { readFile } from 'node:fs/promises'

import { array, object, optional, safeParse, string } from 'valibot'

// Meta SHARD-COMPAT CP7: `wildshard migrate --dry-run <file>` asks the
// API's preflight (`POST /api/shardfiles/dry-run`, api-server CP7a) what
// admission would do with a shard file: its format against the API's,
// the migrations it would run, the chain that runs them and the digest
// of what would play, the SHA-256 the API records for it. Nothing is
// stored and no key is sent.

/** The API migrate talks to when neither --server nor WILDSHARD_API_URL is set. */
const DEFAULT_SERVER = 'https://api.wildshard.io'
const OK = 200
const NONE = 0

const Ids = array(string())
const AnswerSchema = object({
  format: string(),
  apiFormat: string(),
  floor: string(),
  chainId: string(),
  migrations: Ids,
  digest: string(),
  deprecations: optional(Ids),
})
const RefusalSchema = object({ error: string() })

interface MigrateOptions {
  /** --server, else WILDSHARD_API_URL, else empty (then the default API). */
  readonly server: string
  /** The shard file `wildshard build` wrote. */
  readonly file: string
  readonly report: (line: string) => void
  /** Tests pass their own. */
  readonly fetch?: typeof fetch
}

function listed(ids: readonly string[]): string {
  return ids.length === NONE ? 'none' : ids.join(', ')
}

/** Why the API refused, from its answer. */
function refusalOf(status: number, body: unknown): Error {
  const refused = safeParse(RefusalSchema, body)
  const reason = refused.success
    ? refused.output.error
    : `HTTP ${String(status)}`
  return new Error(`the API refuses it: ${reason}`)
}

/** The API's dry run for the file: its status and answer. */
async function asked(
  options: Readonly<MigrateOptions>,
): Promise<Readonly<{ status: number; body: unknown }>> {
  const server = options.server === '' ? DEFAULT_SERVER : options.server
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/x-tar' },
    body: Uint8Array.from(await readFile(options.file)),
  }
  const reply = await (options.fetch ?? fetch)(
    new URL('/api/shardfiles/dry-run', server),
    init,
  )
  const body: unknown = await reply.json()
  return { status: reply.status, body }
}

/** Ask the API's dry run and print what admission would do; throws on a refusal. */
async function migrateDryRun(options: Readonly<MigrateOptions>): Promise<void> {
  const { status, body } = await asked(options)
  const answer = safeParse(AnswerSchema, body)
  if (status !== OK || !answer.success) {
    throw refusalOf(status, body)
  }
  const { format, apiFormat, chainId, migrations, digest } = answer.output
  const deprecated = listed(answer.output.deprecations ?? [])
  for (const line of [
    `format ${format}, the API is at ${apiFormat}`,
    `migrations: ${listed(migrations)}`,
    `deprecated: ${deprecated}`,
    `chain: ${chainId}`,
    `digest: ${digest}`,
  ]) {
    options.report(line)
  }
}

export { type MigrateOptions, migrateDryRun }
