import { parseArgs } from 'node:util'

import { migrateDryRun } from './migrate.ts'

// `wildshard migrate --dry-run <file> [--server <url>]` (meta SHARD-COMPAT
// CP7). bin/wildshard.mjs runs this file with the verb's arguments after
// it. Reads WILDSHARD_API_URL when --server is absent. Only the dry run
// exists: admission migrates on upload.

const EXIT_OK = 0
const EXIT_USAGE = 1
const EXIT_FAILED = 3
/** Where the verb's arguments start in process.argv: [node, this script, ...them]. */
const FIRST_ARG = 2
const ONE = 1
const USAGE = 'usage: wildshard migrate --dry-run <file> [--server <url>]\n'

// oxlint-disable-next-line node/no-process-env -- the CLI is the env boundary
const fromEnv = process.env['WILDSHARD_API_URL'] ?? ''

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

try {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(FIRST_ARG),
    options: { 'dry-run': { type: 'boolean' }, server: { type: 'string' } },
    allowPositionals: true,
  })
  const [file] = positionals
  if (
    values['dry-run'] !== true ||
    positionals.length !== ONE ||
    file === undefined
  ) {
    process.stderr.write(USAGE)
    process.exitCode = EXIT_USAGE
  } else {
    await migrateDryRun({
      server: values.server ?? fromEnv,
      file,
      report: (line: string): void => {
        process.stdout.write(`${line}\n`)
      },
    })
    process.exitCode = EXIT_OK
  }
} catch (error: unknown) {
  process.stderr.write(`wildshard: migrate: ${messageOf(error)}\n`)
  process.exitCode = EXIT_FAILED
}
