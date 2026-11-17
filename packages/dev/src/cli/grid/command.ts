import { parseArgs } from 'node:util'

import { showGrid } from './grid.ts'

// `wildshard grid [--channel staging|prod|preview] [--server <url>]` (meta
// NEW-SHARD-E2E F29). bin/wildshard.mjs runs this file with the verb's
// arguments after it. Reads WILDSHARD_API_URL when --server is absent.

const EXIT_OK = 0
const EXIT_USAGE = 1
const EXIT_FAILED = 3
/** Where the verb's arguments start in process.argv: [node, this script, ...them]. */
const FIRST_ARG = 2
/** The verb takes no positional arguments. */
const NO_ARGS = 0

// oxlint-disable-next-line node/no-process-env -- the CLI is the env boundary
const fromEnv = process.env['WILDSHARD_API_URL'] ?? ''

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

try {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(FIRST_ARG),
    options: { channel: { type: 'string' }, server: { type: 'string' } },
    allowPositionals: true,
  })
  if (positionals.length > NO_ARGS) {
    process.stderr.write(
      'usage: wildshard grid [--channel staging|prod|preview] [--server <url>]\n',
    )
    process.exitCode = EXIT_USAGE
  } else {
    await showGrid({
      server: values.server ?? fromEnv,
      channel: values.channel,
      report: (line: string): void => {
        process.stdout.write(`${line}\n`)
      },
    })
    process.exitCode = EXIT_OK
  }
} catch (error: unknown) {
  process.stderr.write(`wildshard: grid: ${messageOf(error)}\n`)
  process.exitCode = EXIT_FAILED
}
